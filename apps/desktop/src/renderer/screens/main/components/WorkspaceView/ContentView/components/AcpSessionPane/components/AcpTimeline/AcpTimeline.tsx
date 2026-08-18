import type {
	FoldedTimeline,
	PlanItem,
	RequestPermissionOutcome,
	SessionStatus,
	TimelineItem,
	TranscriptTurnSummary,
} from "@superset/session-protocol";
import { cn } from "@superset/ui/utils";
import {
	measureElement as defaultMeasureElement,
	observeElementRect as defaultObserveElementRect,
	type Rect,
	useVirtualizer,
	type Virtualizer,
} from "@tanstack/react-virtual";
import { ArrowDown } from "lucide-react";
import {
	forwardRef,
	memo,
	type UIEvent,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { AcpEmptyState } from "../AcpEmptyState";
import { AcpAgentAuthorRow, AcpMessageItem } from "./components/AcpMessageItem";
import { AcpPlanDock } from "./components/AcpPlanDock";
import { AcpPlanItem } from "./components/AcpPlanItem";
import { AcpSubagentItem } from "./components/AcpSubagentItem";
import { AcpToolCallItem } from "./components/AcpToolCallItem";
import { AcpTurnRail, type AcpTurnRailItem } from "./components/AcpTurnRail";
import { AcpTurnSummary } from "./components/AcpTurnSummary";
import { AcpUnknownContent } from "./components/AcpUnknownContent";
import {
	getTurnUserMessage,
	groupTurns,
	isTurnAutoCollapsible,
	messagePreviewText,
	turnSummaryText,
} from "./utils/turns";
import { formatTurnDuration, useTurnDurations } from "./utils/useTurnDurations";

const ESTIMATED_TURN_HEIGHT = 240;
const VIRTUALIZER_FALLBACK_VIEWPORT_HEIGHT = 640;
const VIRTUALIZER_INITIAL_RECT: Rect = {
	width: 0,
	height: VIRTUALIZER_FALLBACK_VIEWPORT_HEIGHT,
};

/**
 * A hidden kept-alive pane has a zero-sized scroll element until it is shown.
 * Keep a small estimated window mounted in that state so the first focused
 * frame can still measure/locate a turn; ResizeObserver replaces this value
 * with the real viewport as soon as layout is available.
 */
function observeTimelineRect(
	instance: Virtualizer<HTMLDivElement, HTMLDivElement>,
	callback: (rect: Rect) => void,
) {
	return defaultObserveElementRect(instance, (rect) =>
		callback({
			...rect,
			height: rect.height || VIRTUALIZER_FALLBACK_VIEWPORT_HEIGHT,
		}),
	);
}

function measureTimelineTurn(
	element: HTMLDivElement,
	entry: ResizeObserverEntry | undefined,
	instance: Virtualizer<HTMLDivElement, HTMLDivElement>,
): number {
	return (
		defaultMeasureElement(element, entry, instance) || ESTIMATED_TURN_HEIGHT
	);
}

interface AcpTimelineProps {
	timeline: FoldedTimeline;
	onRespond(
		requestId: string,
		outcome: RequestPermissionOutcome,
	): Promise<void>;
	className?: string;
	onOpenFile?(path: string): void;
	cwd?: string;
	model?: string;
	/** Human-readable agent name for message author labels. */
	agentLabel?: string;
	/** Session id, passed to the empty state so the boot animation can resume. */
	sessionId?: string;
	/** Current session status, used to distinguish an idle timeline from work. */
	status?: SessionStatus;
	/** Whether the pane is displayed. Inactive tabs stay mounted but use display:none. */
	isFocused?: boolean;
	/** Whether an older journal page is available before this timeline. */
	hasOlder?: boolean;
	isLoadingOlder?: boolean;
	historyError?: Error | null;
	onLoadOlder?(): Promise<void>;
	/** Full semantic turn index; loaded content remains in `timeline`. */
	turnIndex?: readonly TranscriptTurnSummary[];
	totalTurns?: number;
	loadedTurnNumbers?: readonly number[];
	onLoadTurn?(turnNumber: number): Promise<void>;
}

export interface AcpTimelineHandle {
	scrollToLastUserMessage(): boolean;
}

function isCompletedPlan(item: PlanItem): boolean {
	return (
		item.entries.length > 0 &&
		item.entries.every((entry) => entry.status === "completed")
	);
}

/** The session status is the source of truth for the bottom activity indicator. */
export function shouldShowWorkingIndicator(
	_items: readonly TimelineItem[],
	status?: SessionStatus,
): boolean {
	return status === "running";
}

function renderItem(
	item: TimelineItem,
	onRespond: (
		requestId: string,
		outcome: RequestPermissionOutcome,
	) => Promise<void>,
	agentLabel?: string,
	onOpenFile?: (path: string) => void,
	presentation: "default" | "subagent" = "default",
): React.ReactNode {
	if (item.kind === "message") {
		return (
			<AcpMessageItem
				key={item.id}
				item={item}
				agentLabel={agentLabel}
				hideAuthor={item.role === "agent"}
			/>
		);
	}
	if (item.kind === "tool_call") {
		if (item.semantics.kind === "subagent") {
			return (
				<AcpSubagentItem
					key={item.id}
					item={item}
					renderChild={(child) =>
						renderItem(child, onRespond, agentLabel, onOpenFile, "subagent")
					}
				/>
			);
		}
		return (
			<AcpToolCallItem
				key={item.id}
				item={item}
				onOpenFile={onOpenFile}
				onRespond={onRespond}
				presentation={presentation}
				renderChild={(child) =>
					renderItem(child, onRespond, agentLabel, onOpenFile, "subagent")
				}
			/>
		);
	}
	if (item.kind === "plan") {
		return <AcpPlanItem key={item.id} item={item} />;
	}
	return (
		<AcpUnknownContent
			key={(item as TimelineItem & { id: string }).id}
			content={item}
		/>
	);
}

export const AcpTimeline = memo(
	forwardRef<AcpTimelineHandle, AcpTimelineProps>(function AcpTimeline(
		{
			timeline,
			onRespond,
			className,
			cwd,
			onOpenFile,
			model,
			agentLabel,
			sessionId,
			status,
			isFocused = true,
			hasOlder = false,
			isLoadingOlder = false,
			historyError = null,
			onLoadOlder,
			turnIndex = [],
			totalTurns = 0,
			loadedTurnNumbers = [],
			onLoadTurn,
		},
		ref,
	) {
		const scrollRef = useRef<HTMLDivElement>(null);
		const turnListRef = useRef<HTMLDivElement>(null);
		const [autoFollow, setAutoFollow] = useState(true);
		const [showJumpButton, setShowJumpButton] = useState(false);
		const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
		const activeTurnFrameRef = useRef<number | null>(null);
		const hasInitiallyScrolledRef = useRef(false);
		const wasFocusedRef = useRef(isFocused);
		const lastUserMessageIdRef = useRef<string | null>(null);
		// Guarded while a programmatic smooth-scroll to a user message is running.
		// Without it, the first onScroll frames still read as "near bottom" (the
		// viewport hasn't moved yet), autoFollow flips back to true, and the follow
		// effect below snaps to scrollHeight — cancelling the smooth scroll.
		const isJumpingToUserRef = useRef(false);
		const jumpEndTimerRef = useRef<number | null>(null);
		const prependAnchorRef = useRef<{
			scrollHeight: number;
			scrollTop: number;
			element: HTMLElement | null;
			elementTop: number | null;
		} | null>(null);
		const skipAutoFollowAfterPrependRef = useRef(false);
		const topLoadTriggeredRef = useRef(false);
		const loadOlderRef = useRef<(() => Promise<void>) | null>(null);

		const isNearBottom = useCallback((el: HTMLElement): boolean => {
			return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
		}, []);

		const updateActiveTurn = useCallback((el: HTMLElement) => {
			const turns = el.querySelectorAll<HTMLElement>("[data-turn-id]");
			if (turns.length === 0) return;

			const viewportTop = el.getBoundingClientRect().top;
			const readingLine = viewportTop + Math.min(el.clientHeight * 0.3, 160);
			let low = 0;
			let high = turns.length - 1;
			let activeIndex = 0;
			while (low <= high) {
				const middle = Math.floor((low + high) / 2);
				const candidate = turns[middle];
				if (candidate && candidate.getBoundingClientRect().top <= readingLine) {
					activeIndex = middle;
					low = middle + 1;
				} else {
					high = middle - 1;
				}
			}

			const nextActiveId = turns[activeIndex]?.dataset.turnId ?? null;
			setActiveTurnId((current) =>
				current === nextActiveId ? current : nextActiveId,
			);
		}, []);

		const handleScroll = useCallback(
			(e: UIEvent<HTMLDivElement>) => {
				if (isJumpingToUserRef.current) return;
				const el = e.currentTarget;
				const near = isNearBottom(el);
				setAutoFollow(near);
				setShowJumpButton(!near);
				if (el.scrollTop > 96) topLoadTriggeredRef.current = false;
				if (
					el.scrollTop <= 48 &&
					hasOlder &&
					!isLoadingOlder &&
					!topLoadTriggeredRef.current &&
					loadOlderRef.current
				) {
					topLoadTriggeredRef.current = true;
					void loadOlderRef.current().finally(() => {
						const currentScroll = scrollRef.current;
						if (currentScroll && currentScroll.scrollTop > 96) {
							topLoadTriggeredRef.current = false;
						}
					});
				}
				if (activeTurnFrameRef.current !== null) {
					window.cancelAnimationFrame(activeTurnFrameRef.current);
				}
				activeTurnFrameRef.current = window.requestAnimationFrame(() => {
					updateActiveTurn(el);
					activeTurnFrameRef.current = null;
				});
			},
			[hasOlder, isLoadingOlder, isNearBottom, updateActiveTurn],
		);

		const scrollToBottom = useCallback(() => {
			const el = scrollRef.current;
			if (!el) return;
			el.scrollTop = el.scrollHeight;
			setAutoFollow(true);
			setShowJumpButton(false);
		}, []);

		const loadOlder = useCallback(async () => {
			const scroll = scrollRef.current;
			if (scroll) {
				const firstVisible = Array.from(
					scroll.querySelectorAll<HTMLElement>("[data-turn-id]"),
				).find(
					(element) =>
						element.getBoundingClientRect().bottom >
						scroll.getBoundingClientRect().top,
				);
				prependAnchorRef.current = {
					scrollHeight: scroll.scrollHeight,
					scrollTop: scroll.scrollTop,
					element: firstVisible ?? null,
					elementTop: firstVisible?.getBoundingClientRect().top ?? null,
				};
				skipAutoFollowAfterPrependRef.current = true;
			}
			await onLoadOlder?.();
		}, [onLoadOlder]);
		loadOlderRef.current = loadOlder;

		useImperativeHandle(
			ref,
			() => ({
				scrollToLastUserMessage() {
					const scroll = scrollRef.current;
					if (!scroll) return false;
					const userMsgs = scroll.querySelectorAll<HTMLElement>(
						'.acp-msg[data-role="user"]',
					);
					const target = userMsgs[userMsgs.length - 1];
					if (!target) return false;

					// Suppress autoFollow updates + the follow effect for the smooth
					// scroll's duration. A single class on the scroll container gates
					// the follow effect (see `[data-jumping-to-user]` below); the ref
					// gates the scroll handler.
					if (jumpEndTimerRef.current !== null) {
						window.clearTimeout(jumpEndTimerRef.current);
					}
					isJumpingToUserRef.current = true;
					scroll.dataset.jumpingToUser = "true";
					setAutoFollow(false);
					setShowJumpButton(true);
					target.scrollIntoView({ behavior: "smooth", block: "start" });
					target.classList.remove("is-flashed");
					// Force reflow so the animation restarts on repeated clicks.
					void target.offsetWidth;
					target.classList.add("is-flashed");
					jumpEndTimerRef.current = window.setTimeout(() => {
						isJumpingToUserRef.current = false;
						delete scroll.dataset.jumpingToUser;
						target.classList.remove("is-flashed");
						// Recompute autoFollow from the final scroll position.
						const near = isNearBottom(scroll);
						setAutoFollow(near);
						setShowJumpButton(!near);
						jumpEndTimerRef.current = null;
					}, 700);
					return true;
				},
			}),
			[isNearBottom],
		);

		useEffect(() => {
			return () => {
				if (jumpEndTimerRef.current !== null) {
					window.clearTimeout(jumpEndTimerRef.current);
				}
				if (activeTurnFrameRef.current !== null) {
					window.cancelAnimationFrame(activeTurnFrameRef.current);
				}
			};
		}, []);

		useLayoutEffect(() => {
			const anchor = prependAnchorRef.current;
			const scroll = scrollRef.current;
			if (!anchor || !scroll || isLoadingOlder) return;
			prependAnchorRef.current = null;
			if (anchor.element?.isConnected && anchor.elementTop !== null) {
				const nextTop = anchor.element.getBoundingClientRect().top;
				scroll.scrollTop += nextTop - anchor.elementTop;
			} else {
				scroll.scrollTop =
					anchor.scrollTop + (scroll.scrollHeight - anchor.scrollHeight);
			}
		}, [isLoadingOlder]);

		useEffect(() => {
			const el = scrollRef.current;
			if (!el) return;
			if (timeline.items.length === 0) return;

			const latestUserMessageId = timeline.items.findLast(
				(item) => item.kind === "message" && item.role === "user",
			)?.id;
			const hasNewUserMessage =
				hasInitiallyScrolledRef.current &&
				latestUserMessageId !== undefined &&
				latestUserMessageId !== lastUserMessageIdRef.current;
			lastUserMessageIdRef.current = latestUserMessageId ?? null;

			// Streaming updates must not fight an in-flight jump-to-user scroll, but
			// sending a new prompt always takes precedence and returns to the bottom.
			if (isJumpingToUserRef.current) {
				if (!hasNewUserMessage) return;
				if (jumpEndTimerRef.current !== null) {
					window.clearTimeout(jumpEndTimerRef.current);
					jumpEndTimerRef.current = null;
				}
				isJumpingToUserRef.current = false;
				delete el.dataset.jumpingToUser;
				el.querySelector(".acp-msg.is-flashed")?.classList.remove("is-flashed");
			}
			if (skipAutoFollowAfterPrependRef.current) {
				skipAutoFollowAfterPrependRef.current = false;
				return;
			}

			if (!hasInitiallyScrolledRef.current || autoFollow || hasNewUserMessage) {
				el.scrollTop = el.scrollHeight;
				hasInitiallyScrolledRef.current = true;
			}
			if (hasNewUserMessage) {
				setAutoFollow(true);
				setShowJumpButton(false);
			}
		}, [timeline.items, autoFollow]);

		useEffect(() => {
			const becameFocused = isFocused && !wasFocusedRef.current;
			wasFocusedRef.current = isFocused;
			if (!becameFocused || !autoFollow) return;

			// Kept-alive panes are display:none while inactive, causing their
			// scrollHeight to read as zero during streaming updates. Wait until the
			// browser has restored layout before returning an auto-following reader
			// to the latest item. A deliberate manual reading position is untouched.
			const frame = window.requestAnimationFrame(() => {
				const el = scrollRef.current;
				if (el) el.scrollTop = el.scrollHeight;
			});
			return () => window.cancelAnimationFrame(frame);
		}, [isFocused, autoFollow]);

		const showWorkingIndicator = shouldShowWorkingIndicator(
			timeline.items,
			status,
		);
		const activePlan = timeline.items.findLast(
			(item): item is PlanItem =>
				item.kind === "plan" && !item.removed && !isCompletedPlan(item),
		);
		const visibleItems = timeline.items.filter(
			(item) =>
				item.id !== activePlan?.id &&
				!(item.kind === "plan" && isCompletedPlan(item)),
		);
		// Group the visible flat timeline into turns for collapse-per-turn
		// rendering. `expandedOverrides` remembers which completed turns the user
		// manually expanded so clicks stick while more items stream in.
		const turns = useMemo(() => groupTurns(visibleItems), [visibleItems]);
		const turnDurations = useTurnDurations(sessionId, turns, status);
		const turnNumberById = useMemo(() => {
			const numbers = new Map<string, number>();
			let turnNumber = 0;
			for (const turn of turns) {
				const userMessage = getTurnUserMessage(turn);
				if (!userMessage) continue;
				const indexed = turnIndex.find(
					(summary) => summary.startSeq === userMessage.startSeq,
				);
				turnNumber += 1;
				numbers.set(turn.id, indexed?.turnNumber ?? turnNumber);
			}
			return numbers;
		}, [turnIndex, turns]);
		// Async rail navigation can span a transcript fetch and a React commit.
		// Keep the latest grouped turns available to that callback while retaining
		// stable virtualizer/item keys across prepends.
		const turnsRef = useRef(turns);
		turnsRef.current = turns;
		const turnNumberByIdRef = useRef(turnNumberById);
		turnNumberByIdRef.current = turnNumberById;
		const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
			count: turns.length,
			getScrollElement: () => scrollRef.current,
			getItemKey: (index) => turns[index]?.id ?? index,
			estimateSize: () => ESTIMATED_TURN_HEIGHT,
			gap: 12,
			initialRect: VIRTUALIZER_INITIAL_RECT,
			measureElement: measureTimelineTurn,
			observeElementRect: observeTimelineRect,
			overscan: 3,
			scrollMargin: turnListRef.current?.offsetTop ?? 0,
		});
		const virtualTurns = virtualizer.getVirtualItems();
		const latestLoadedTurnId = Array.from(turnNumberById.keys()).at(-1) ?? null;
		const latestLoadedTurnNumber = latestLoadedTurnId
			? turnNumberById.get(latestLoadedTurnId)
			: undefined;
		const latestTurnId =
			turnIndex.length > 0
				? latestLoadedTurnNumber
					? `turn:${latestLoadedTurnNumber}`
					: null
				: latestLoadedTurnId;
		const resolvedActiveTurnId =
			activeTurnId &&
			(turnIndex.length > 0
				? activeTurnId.startsWith("turn:")
				: turnNumberById.has(activeTurnId))
				? activeTurnId
				: latestTurnId;
		const turnRailItems = useMemo(() => {
			if (turnIndex.length > 0) {
				const loadedByNumber = new Map<number, (typeof turns)[number]>();
				for (const turn of turns) {
					const number = turnNumberById.get(turn.id);
					if (number !== undefined) loadedByNumber.set(number, turn);
				}
				return turnIndex.map<AcpTurnRailItem>((summary) => {
					const loaded = loadedByNumber.get(summary.turnNumber);
					const userMessage = loaded ? getTurnUserMessage(loaded) : null;
					return {
						id: `turn:${summary.turnNumber}`,
						turnNumber: summary.turnNumber,
						isComplete:
							loaded && summary.turnNumber === totalTurns
								? loaded.isComplete &&
									status !== "starting" &&
									status !== "running" &&
									status !== "awaiting_permission"
								: (loaded?.isComplete ?? summary.isComplete),
						isLoaded: loadedTurnNumbers.includes(summary.turnNumber),
						userPreview: userMessage
							? messagePreviewText(userMessage)
							: summary.userPreview,
						agentPreview: loaded?.finalAgentMessage
							? messagePreviewText(loaded.finalAgentMessage)
							: summary.agentPreview,
					};
				});
			}
			return turns.flatMap<AcpTurnRailItem>((turn, index) => {
				const turnNumber = turnNumberById.get(turn.id);
				const userMessage = getTurnUserMessage(turn);
				if (!turnNumber || !userMessage) return [];

				const isLast = index === turns.length - 1;
				const isComplete =
					!isLast ||
					(turn.isComplete &&
						status !== "starting" &&
						status !== "running" &&
						status !== "awaiting_permission");
				return [
					{
						id: turn.id,
						turnNumber,
						isComplete,
						userPreview: messagePreviewText(userMessage),
						agentPreview: turn.finalAgentMessage
							? messagePreviewText(turn.finalAgentMessage)
							: null,
					},
				];
			});
		}, [
			loadedTurnNumbers,
			status,
			totalTurns,
			turnIndex,
			turnNumberById,
			turns,
		]);
		const [expandedOverrides, setExpandedOverrides] = useState<
			Record<string, boolean>
		>({});
		const toggleTurnExpanded = useCallback((turnId: string) => {
			setExpandedOverrides((prev) => ({
				...prev,
				[turnId]: !(prev[turnId] ?? false),
			}));
		}, []);
		const navigateToTurn = useCallback(
			async (turnId: string, turnNumber: number) => {
				const scroll = scrollRef.current;
				let target = scroll?.querySelector<HTMLElement>(
					`[data-turn-number="${turnNumber}"]`,
				);
				if (!scroll) return;
				if (!target) {
					setActiveTurnId(turnId);
					const findLoadedTurnIndex = () =>
						turnsRef.current.findIndex(
							(turn) => turnNumberByIdRef.current.get(turn.id) === turnNumber,
						);
					let targetIndex = findLoadedTurnIndex();
					if (targetIndex < 0 && onLoadTurn) {
						await onLoadTurn(turnNumber);
						targetIndex = findLoadedTurnIndex();
					}
					if (targetIndex >= 0) {
						// The target may be loaded but outside the current DOM window. Ask
						// the virtualizer to mount it before querying its real element.
						virtualizer.scrollToIndex(targetIndex, { align: "start" });
						await new Promise<void>((resolve) => {
							if (typeof window.requestAnimationFrame === "function") {
								window.requestAnimationFrame(() => resolve());
							} else {
								window.setTimeout(resolve, 0);
							}
						});
					}
					target = scroll.querySelector<HTMLElement>(
						`[data-turn-number="${turnNumber}"]`,
					);
				}
				if (!target) return;
				const scrollBounds = scroll.getBoundingClientRect();
				const targetBounds = target.getBoundingClientRect();
				const targetTop = Math.max(
					0,
					scroll.scrollTop + targetBounds.top - scrollBounds.top - 24,
				);
				if (jumpEndTimerRef.current !== null) {
					window.clearTimeout(jumpEndTimerRef.current);
				}
				// Streaming timeline updates normally keep an auto-following transcript at
				// the bottom. Guard the navigation so those updates cannot cancel the jump
				// before React commits `autoFollow = false`.
				isJumpingToUserRef.current = true;
				scroll.dataset.jumpingToUser = "true";
				setActiveTurnId(turnId);
				setAutoFollow(false);
				setShowJumpButton(true);
				scroll.scrollTop = targetTop;
				jumpEndTimerRef.current = window.setTimeout(() => {
					isJumpingToUserRef.current = false;
					delete scroll.dataset.jumpingToUser;
					const near = isNearBottom(scroll);
					setAutoFollow(near);
					setShowJumpButton(!near);
					jumpEndTimerRef.current = null;
				}, 700);
			},
			[isNearBottom, onLoadTurn, virtualizer],
		);

		const activeTurnDuration = latestLoadedTurnId
			? formatTurnDuration(turnDurations.get(latestLoadedTurnId) ?? 0)
			: null;
		const workingIndicator = showWorkingIndicator && (
			<output className="acp-timeline__working">
				<span className="acp-blink" aria-hidden>
					●
				</span>
				<span>Working…</span>
				{activeTurnDuration && (
					<span className="acp-timeline__working-duration">
						{activeTurnDuration}
					</span>
				)}
			</output>
		);
		const olderHistoryControl = (isLoadingOlder || historyError) && (
			<div className="acp-timeline__older-history">
				{isLoadingOlder && <output>Loading earlier turns…</output>}
				{historyError && (
					<>
						<span role="alert">Couldn’t load earlier turns.</span>
						<button
							type="button"
							onClick={() => void loadOlder()}
							disabled={!onLoadOlder}
						>
							Retry
						</button>
					</>
				)}
			</div>
		);

		if (timeline.items.length === 0) {
			return (
				<div className="acp-pane__timeline">
					<div
						className={cn("acp-pane__scroll", className)}
						ref={scrollRef}
						onScroll={handleScroll}
					>
						{olderHistoryControl}
						<AcpEmptyState
							sessionId={sessionId}
							cwd={cwd}
							model={model}
							agentLabel={agentLabel}
						/>
						{workingIndicator}
					</div>
				</div>
			);
		}

		return (
			<div
				className="acp-pane__timeline"
				data-has-plan={activePlan ? "true" : undefined}
			>
				<AcpTurnRail
					items={turnRailItems}
					activeTurnId={resolvedActiveTurnId}
					agentLabel={agentLabel}
					onNavigate={navigateToTurn}
					totalTurns={totalTurns > 0 ? totalTurns : undefined}
				/>
				<div
					className={cn("acp-pane__scroll", className)}
					ref={scrollRef}
					onScroll={handleScroll}
				>
					<div className="acp-pane__body-inner">
						{olderHistoryControl}
						<div className="acp-timeline__turn-list" ref={turnListRef}>
							<div
								className="acp-timeline__turns"
								style={{ height: virtualizer.getTotalSize() }}
							>
								{virtualTurns.map((virtualTurn) => {
									const turn = turns[virtualTurn.index];
									if (!turn) return null;
									const isLast = virtualTurn.index === turns.length - 1;
									const autoCollapse = isTurnAutoCollapsible(
										turn,
										isLast,
										status,
									);
									const override = expandedOverrides[turn.id];
									const expanded =
										override !== undefined ? override : !autoCollapse;
									const turnNumber = turnNumberById.get(turn.id);
									const duration = formatTurnDuration(
										turnDurations.get(turn.id) ?? 0,
									);
									return (
										<div
											key={virtualTurn.key}
											className="acp-timeline__virtual-turn"
											data-index={virtualTurn.index}
											ref={virtualizer.measureElement}
											style={{
												top:
													virtualTurn.start -
													(virtualizer.options.scrollMargin ?? 0),
											}}
										>
											<section
												className="acp-turn"
												data-turn-id={
													turnNumber
														? turnIndex.length > 0
															? `turn:${turnNumber}`
															: turn.id
														: undefined
												}
												data-turn-number={turnNumber}
											>
												{turn.preItems.map((item) =>
													renderItem(item, onRespond, agentLabel, onOpenFile),
												)}
												{/* Author row heads the whole agent turn (process
												    summary + final reply). Only shown when the turn
												    has agent output to attribute. */}
												{(turn.processItems.length > 0 ||
													turn.finalAgentMessage) && (
													<AcpAgentAuthorRow agentLabel={agentLabel} />
												)}
												{autoCollapse && (
													<AcpTurnSummary
														text={turnSummaryText(turn)}
														expanded={expanded}
														onToggle={() => toggleTurnExpanded(turn.id)}
														duration={duration}
													/>
												)}
												{expanded &&
													turn.processItems.map((item) =>
														renderItem(item, onRespond, agentLabel, onOpenFile),
													)}
												{turn.finalAgentMessage &&
													renderItem(
														turn.finalAgentMessage,
														onRespond,
														agentLabel,
														onOpenFile,
													)}
												{turn.trailingItems.map((item) =>
													renderItem(item, onRespond, agentLabel, onOpenFile),
												)}
											</section>
										</div>
									);
								})}
							</div>
						</div>
						{workingIndicator}
					</div>
				</div>
				{activePlan && <AcpPlanDock key={activePlan.id} item={activePlan} />}
				{showJumpButton && (
					<button
						type="button"
						className="acp-pane__jump"
						onClick={scrollToBottom}
						aria-label="Jump to latest"
					>
						<ArrowDown className="size-4" />
					</button>
				)}
			</div>
		);
	}),
);
