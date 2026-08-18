import type {
	FoldedTimeline,
	PlanItem,
	RequestPermissionOutcome,
	SessionStatus,
	TimelineItem,
} from "@superset/session-protocol";
import { cn } from "@superset/ui/utils";
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
}

export interface AcpTimelineHandle {
	scrollToLastUserMessage(): boolean;
}

function flattenTimelineItems(items: readonly TimelineItem[]): TimelineItem[] {
	return items.flatMap((item) =>
		item.kind === "tool_call"
			? [item, ...flattenTimelineItems(item.children)]
			: [item],
	);
}

function isCompletedPlan(item: PlanItem): boolean {
	return (
		item.entries.length > 0 &&
		item.entries.every((entry) => entry.status === "completed")
	);
}

/**
 * A running session can have a short quiet interval between ACP frames. The
 * latest item supplies sufficient activity feedback when it is a streaming
 * message/thought or a pending tool; otherwise render a lightweight indicator.
 * Subagents keep the indicator visible so delegated activity does not make the
 * main agent's running state disappear from the bottom of the timeline.
 */
export function shouldShowWorkingIndicator(
	items: readonly TimelineItem[],
	status?: SessionStatus,
): boolean {
	if (status !== "running") return false;

	const latestRoot = items.at(-1);
	if (
		latestRoot?.kind === "tool_call" &&
		latestRoot.semantics.kind === "subagent"
	) {
		return true;
	}

	const latest = flattenTimelineItems(items).at(-1);
	if (!latest) return true;
	if (latest.kind === "tool_call") {
		return (
			latest.call.status !== "in_progress" && latest.call.status !== "pending"
		);
	}
	return latest.kind !== "message" || latest.role === "user";
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
		},
		ref,
	) {
		const scrollRef = useRef<HTMLDivElement>(null);
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
		} | null>(null);
		const skipAutoFollowAfterPrependRef = useRef(false);

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
				if (activeTurnFrameRef.current !== null) {
					window.cancelAnimationFrame(activeTurnFrameRef.current);
				}
				activeTurnFrameRef.current = window.requestAnimationFrame(() => {
					updateActiveTurn(el);
					activeTurnFrameRef.current = null;
				});
			},
			[isNearBottom, updateActiveTurn],
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
				prependAnchorRef.current = {
					scrollHeight: scroll.scrollHeight,
					scrollTop: scroll.scrollTop,
				};
				skipAutoFollowAfterPrependRef.current = true;
			}
			await onLoadOlder?.();
		}, [onLoadOlder]);

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
			scroll.scrollTop =
				anchor.scrollTop + (scroll.scrollHeight - anchor.scrollHeight);
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
				if (!getTurnUserMessage(turn)) continue;
				turnNumber += 1;
				numbers.set(turn.id, turnNumber);
			}
			return numbers;
		}, [turns]);
		const latestTurnId = Array.from(turnNumberById.keys()).at(-1) ?? null;
		const resolvedActiveTurnId =
			activeTurnId && turnNumberById.has(activeTurnId)
				? activeTurnId
				: latestTurnId;
		const turnRailItems = useMemo(() => {
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
		}, [status, turnNumberById, turns]);
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
			(turnId: string, turnNumber: number) => {
				const scroll = scrollRef.current;
				const target = scroll?.querySelector<HTMLElement>(
					`[data-turn-number="${turnNumber}"]`,
				);
				if (!scroll || !target) return;
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
			[isNearBottom],
		);

		const activeTurnDuration = latestTurnId
			? formatTurnDuration(turnDurations.get(latestTurnId) ?? 0)
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
		const olderHistoryControl = (hasOlder || historyError) && (
			<div className="acp-timeline__older-history">
				<button
					type="button"
					onClick={() => void loadOlder()}
					disabled={isLoadingOlder || !onLoadOlder}
				>
					{isLoadingOlder
						? "Loading earlier messages…"
						: "Load earlier messages"}
				</button>
				{historyError && (
					<span role="alert">Couldn’t load earlier messages. Try again.</span>
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
				/>
				<div
					className={cn("acp-pane__scroll", className)}
					ref={scrollRef}
					onScroll={handleScroll}
				>
					<div className="acp-pane__body-inner">
						{olderHistoryControl}
						{turns.map((turn, i) => {
							const isLast = i === turns.length - 1;
							const autoCollapse = isTurnAutoCollapsible(turn, isLast, status);
							const override = expandedOverrides[turn.id];
							const expanded =
								override !== undefined ? override : !autoCollapse;
							const turnNumber = turnNumberById.get(turn.id);
							const duration = formatTurnDuration(
								turnDurations.get(turn.id) ?? 0,
							);
							return (
								<section
									key={turn.id}
									className="acp-turn"
									data-turn-id={turnNumber ? turn.id : undefined}
									data-turn-number={turnNumber}
								>
									{turn.preItems.map((item) =>
										renderItem(item, onRespond, agentLabel, onOpenFile),
									)}
									{/* Author row heads the whole agent turn (process
									    summary + final reply). Only shown when the turn
									    has agent output to attribute. */}
									{(turn.processItems.length > 0 || turn.finalAgentMessage) && (
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
							);
						})}
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
