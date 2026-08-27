import type {
	FoldedTimeline,
	PlanItem,
	RequestPermissionOutcome,
	RespondToPermissionResult,
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
import type { MarkdownFileTarget } from "../AcpMarkdown/linkifyAcpMarkdown";
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
	isTurnSettled,
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

function isActiveSessionStatus(status?: SessionStatus): boolean {
	return (
		status === "starting" ||
		status === "running" ||
		status === "awaiting_permission"
	);
}

/**
 * Find the final response in the latest mounted turn. The turn author row is
 * also marked as an agent for styling, so it must not be treated as the reply
 * anchor when restoring a hidden pane.
 */
function findLatestFinalAgentMessage(
	scroll: HTMLElement,
	latestTurnId: string | null,
): HTMLElement | null {
	const finalMessageSelector =
		'.acp-msg[data-role="agent"]:not(.acp-msg--author-only)';
	const lastAgentMessage = (root: ParentNode) => {
		const messages = root.querySelectorAll<HTMLElement>(finalMessageSelector);
		return messages.item(messages.length - 1);
	};
	if (latestTurnId) {
		const latestTurn = Array.from(
			scroll.querySelectorAll<HTMLElement>("[data-turn-id]"),
		).find((turn) => turn.dataset.turnId === latestTurnId);
		return latestTurn ? lastAgentMessage(latestTurn) : null;
	}
	return lastAgentMessage(scroll);
}

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
	): Promise<RespondToPermissionResult> | Promise<void>;
	className?: string;
	onOpenFile?(path: string): void;
	onOpenMarkdownFile?(
		target: MarkdownFileTarget,
		openExternally: boolean,
	): void;
	onOpenUrl?(url: string): void;
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
	canReviewPlan?: boolean;
	isReviewingPlan?: boolean;
	onApprovePlan?(feedback?: string): Promise<void>;
	onRequestPlanChanges?(feedback: string): Promise<void>;
}

export interface AcpTimelineHandle {
	scrollToLastUserMessage(): boolean;
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
	) => Promise<RespondToPermissionResult> | Promise<void>,
	agentLabel?: string,
	onOpenFile?: (path: string) => void,
	onOpenMarkdownFile?: (
		target: MarkdownFileTarget,
		openExternally: boolean,
	) => void,
	onOpenUrl?: (url: string) => void,
	presentation: "default" | "subagent" = "default",
	showTimestamp = false,
	planReview?: {
		isSubmitting: boolean;
		onApprove(feedback?: string): Promise<void>;
		onRequestChanges(feedback: string): Promise<void>;
	},
): React.ReactNode {
	if (item.kind === "message") {
		return (
			<AcpMessageItem
				key={item.id}
				item={item}
				agentLabel={agentLabel}
				hideAuthor={item.role === "agent"}
				showTimestamp={showTimestamp || item.role === "user"}
				onOpenMarkdownFile={onOpenMarkdownFile}
				onOpenUrl={onOpenUrl}
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
						renderItem(
							child,
							onRespond,
							agentLabel,
							onOpenFile,
							onOpenMarkdownFile,
							onOpenUrl,
							"subagent",
						)
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
					renderItem(
						child,
						onRespond,
						agentLabel,
						onOpenFile,
						onOpenMarkdownFile,
						onOpenUrl,
						"subagent",
					)
				}
			/>
		);
	}
	if (item.kind === "plan") {
		return <AcpPlanItem key={item.id} item={item} review={planReview} />;
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
			onOpenMarkdownFile,
			onOpenUrl,
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
			canReviewPlan = false,
			isReviewingPlan = false,
			onApprovePlan,
			onRequestPlanChanges,
		},
		ref,
	) {
		const scrollRef = useRef<HTMLDivElement>(null);
		const turnListRef = useRef<HTMLDivElement>(null);
		const [autoFollow, setAutoFollow] = useState(true);
		const [showJumpButton, setShowJumpButton] = useState(false);
		const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
		const activeTurnFrameRef = useRef<number | null>(null);
		const initialScrollFrameRef = useRef<number | null>(null);
		const focusScrollFrameRef = useRef<number | null>(null);
		const focusScrollRetryRef = useRef(0);
		const isRestoringFocusRef = useRef(false);
		const hasInitiallyScrolledRef = useRef(false);
		const isInitialFocusRef = useRef(true);
		const wasFocusedRef = useRef(false);
		const previousStatusRef = useRef<SessionStatus | undefined>(status);
		const isFocusedRef = useRef(isFocused);
		isFocusedRef.current = isFocused;
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
				// Programmatic restore writes can emit scroll events. Ignore those
				// without cancelling the retry frame that finishes the restore.
				if (isRestoringFocusRef.current) return;
				if (focusScrollFrameRef.current !== null) {
					window.cancelAnimationFrame(focusScrollFrameRef.current);
					focusScrollFrameRef.current = null;
				}
				if (initialScrollFrameRef.current !== null) {
					window.cancelAnimationFrame(initialScrollFrameRef.current);
					initialScrollFrameRef.current = null;
				}
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
			if (isRestoringFocusRef.current) return;
			if (skipAutoFollowAfterPrependRef.current) {
				skipAutoFollowAfterPrependRef.current = false;
				return;
			}

			if (!hasInitiallyScrolledRef.current) {
				if (!isFocusedRef.current) {
					// A kept-alive hidden pane is not measurable yet. Mark it ready so
					// the focus transition effect below performs the deferred scroll.
					hasInitiallyScrolledRef.current = true;
					return;
				}
				// The virtualizer measures after this effect. Defer the first scroll
				// until the next frame so scrollHeight reflects the rendered history.
				hasInitiallyScrolledRef.current = true;
				const frame = window.requestAnimationFrame(() => {
					const current = scrollRef.current;
					if (current) current.scrollTop = current.scrollHeight;
					initialScrollFrameRef.current = null;
				});
				initialScrollFrameRef.current = frame;
				return () => {
					window.cancelAnimationFrame(frame);
					if (initialScrollFrameRef.current === frame) {
						initialScrollFrameRef.current = null;
					}
				};
			}

			if (autoFollow || hasNewUserMessage) {
				el.scrollTop = el.scrollHeight;
			}
			if (hasNewUserMessage) {
				setAutoFollow(true);
				setShowJumpButton(false);
			}
		}, [timeline.items, autoFollow]);

		const showWorkingIndicator = shouldShowWorkingIndicator(
			timeline.items,
			status,
		);
		// ACP plan updates are snapshots. The latest non-removed snapshot owns the
		// dock, but only while it still has pending or in-progress entries.
		const latestPlan =
			timeline.items.findLast(
				(item): item is PlanItem => item.kind === "plan" && !item.removed,
			) ?? null;
		const dockedPlan =
			latestPlan?.entries.some(
				(entry) => entry.status === "pending" || entry.status === "in_progress",
			) === true
				? latestPlan
				: null;
		// Plans are represented by the dock, never as ordinary transcript content.
		const visibleItems = timeline.items.filter((item) => item.kind !== "plan");
		const reviewablePlan =
			canReviewPlan &&
			status === "idle" &&
			dockedPlan?.entries.some((entry) => entry.status !== "completed") &&
			onApprovePlan &&
			onRequestPlanChanges
				? dockedPlan
				: null;
		const reviewForItem = (item: TimelineItem) =>
			item.id === reviewablePlan?.id && onApprovePlan && onRequestPlanChanges
				? {
						isSubmitting: isReviewingPlan,
						onApprove: onApprovePlan,
						onRequestChanges: onRequestPlanChanges,
					}
				: undefined;
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
		const turnSummaryById = useMemo(() => {
			const summaries = new Map<string, TranscriptTurnSummary>();
			for (const turn of turns) {
				const userMessage = getTurnUserMessage(turn);
				if (!userMessage) continue;
				const summary = turnIndex.find(
					(candidate) => candidate.startSeq === userMessage.startSeq,
				);
				if (summary) summaries.set(turn.id, summary);
			}
			return summaries;
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
		const latestFinalAgentMessage = turns.at(-1)?.finalAgentMessage ?? null;
		useEffect(() => {
			const becameFocused = isFocused && !wasFocusedRef.current;
			const isInitialFocus = isInitialFocusRef.current;
			const becameSettled =
				isFocused &&
				latestFinalAgentMessage !== null &&
				isActiveSessionStatus(previousStatusRef.current) &&
				!isActiveSessionStatus(status);
			previousStatusRef.current = status;
			isInitialFocusRef.current = false;
			wasFocusedRef.current = isFocused;
			if (!becameFocused && !becameSettled) return;
			if (
				isInitialFocus &&
				(latestFinalAgentMessage === null || isActiveSessionStatus(status)) &&
				!becameSettled
			)
				return;

			// A kept-alive pane is display:none while inactive. The virtualizer can
			// therefore still have the old window (or zero-sized measurements) when
			// focus returns. Keep the restore alive for a few frames: first bring the
			// latest turn into the virtual window, then align the actual final reply.
			focusScrollRetryRef.current = 0;
			const scheduleRetry = (callback: () => void): boolean => {
				if (focusScrollRetryRef.current >= 12) return false;
				focusScrollRetryRef.current += 1;
				focusScrollFrameRef.current = window.requestAnimationFrame(callback);
				return true;
			};
			const alignFinalResponse = () => {
				focusScrollFrameRef.current = null;
				isRestoringFocusRef.current = true;
				const el = scrollRef.current;
				if (!el) {
					isRestoringFocusRef.current = false;
					return;
				}

				const finalMessage = findLatestFinalAgentMessage(el, latestTurnId);
				if (!finalMessage) {
					if (scheduleRetry(alignFinalResponse)) return;
					// The final item exists in the folded timeline, but could not be
					// mounted after the virtualizer settled. Bottom is the safe fallback.
					isRestoringFocusRef.current = false;
					setAutoFollow(true);
					setShowJumpButton(false);
					return;
				}

				const scrollBounds = el.getBoundingClientRect();
				const finalMessageBounds = finalMessage.getBoundingClientRect();
				el.scrollTop = Math.max(
					0,
					el.scrollTop + finalMessageBounds.top - scrollBounds.top,
				);
				// Keep the virtualizer's internal offset in sync with the manual
				// alignment. Otherwise a delayed ResizeObserver measurement of a long
				// Markdown reply can restore the stale bottom offset on the next frame.
				el.dispatchEvent(new Event("scroll"));
				isRestoringFocusRef.current = false;
				const near = isNearBottom(el);
				setAutoFollow(near);
				setShowJumpButton(!near);
			};
			const restoreFocusPosition = () => {
				focusScrollFrameRef.current = null;
				isRestoringFocusRef.current = true;
				const el = scrollRef.current;
				if (!el) {
					isRestoringFocusRef.current = false;
					return;
				}

				el.scrollTop = el.scrollHeight;
				// Direct assignment does not notify the virtualizer. Dispatch a real
				// scroll event so it mounts the latest turn without leaving a pending
				// scrollToIndex reconciliation that could snap back to the bottom after
				// the final reply is aligned.
				el.dispatchEvent(new Event("scroll"));

				const shouldFollowBottom =
					isActiveSessionStatus(status) || latestFinalAgentMessage === null;
				const hasLayout = el.clientHeight > 0 || el.scrollHeight > 0;
				if (!hasLayout && timeline.items.length > 0) {
					if (scheduleRetry(restoreFocusPosition)) return;
				}

				if (shouldFollowBottom) {
					isRestoringFocusRef.current = false;
					setAutoFollow(true);
					setShowJumpButton(false);
					return;
				}

				// Let the virtualizer's scroll listener commit its latest mounted
				// window before querying the final message's real geometry.
				if (!scheduleRetry(alignFinalResponse)) {
					isRestoringFocusRef.current = false;
					setAutoFollow(true);
					setShowJumpButton(false);
				}
			};

			focusScrollFrameRef.current =
				window.requestAnimationFrame(restoreFocusPosition);
			return () => {
				isRestoringFocusRef.current = false;
				if (focusScrollFrameRef.current !== null) {
					window.cancelAnimationFrame(focusScrollFrameRef.current);
					focusScrollFrameRef.current = null;
				}
			};
		}, [
			isFocused,
			isNearBottom,
			latestFinalAgentMessage,
			latestTurnId,
			status,
			timeline.items.length,
		]);
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
				data-has-plan={dockedPlan ? "true" : undefined}
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
									const turnSettled = isTurnSettled(turn, isLast, status);
									const persistedSummary = turnSummaryById.get(turn.id);
									const summaryToolCallCount =
										persistedSummary?.toolCallCount ?? turn.toolCallCount;
									const summaryMessageCount =
										persistedSummary?.messageCount ?? turn.messageCount;
									const hasProcessSummary =
										autoCollapse ||
										summaryToolCallCount > 0 ||
										summaryMessageCount > 0;
									const override = expandedOverrides[turn.id];
									const expanded =
										override !== undefined ? override : !hasProcessSummary;
									const turnNumber = turnNumberById.get(turn.id);
									const duration = formatTurnDuration(
										persistedSummary?.durationMs ??
											turnDurations.get(turn.id) ??
											0,
									);
									const processSummaryText = (() => {
										const parts: string[] = [];
										if (summaryToolCallCount > 0) {
											parts.push(`${summaryToolCallCount} 次工具调用`);
										}
										if (summaryMessageCount > 0) {
											parts.push(`${summaryMessageCount} 条消息`);
										}
										return parts.length > 0
											? `执行过程：${parts.join("，")}`
											: turnSummaryText(turn);
									})();
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
													renderItem(
														item,
														onRespond,
														agentLabel,
														onOpenFile,
														onOpenMarkdownFile,
														onOpenUrl,
														"default",
														false,
														reviewForItem(item),
													),
												)}
												{/* Author row heads the whole agent turn (process
												    summary + final reply). Only shown when the turn
												    has agent output to attribute. */}
												{(turn.processItems.length > 0 ||
													turn.finalAgentMessage) && (
													<AcpAgentAuthorRow agentLabel={agentLabel} />
												)}
												{hasProcessSummary && (
													<AcpTurnSummary
														text={processSummaryText}
														expanded={expanded}
														onToggle={() => toggleTurnExpanded(turn.id)}
														duration={duration}
													/>
												)}
												{turn.processItems.map((item) =>
													item.kind === "plan" || expanded
														? renderItem(
																item,
																onRespond,
																agentLabel,
																onOpenFile,
																onOpenMarkdownFile,
																onOpenUrl,
																"default",
																false,
																reviewForItem(item),
															)
														: null,
												)}
												{turn.finalAgentMessage &&
													renderItem(
														turn.finalAgentMessage,
														onRespond,
														agentLabel,
														onOpenFile,
														onOpenMarkdownFile,
														onOpenUrl,
														"default",
														turnSettled,
														reviewForItem(turn.finalAgentMessage),
													)}
												{turn.trailingItems.map((item) =>
													renderItem(
														item,
														onRespond,
														agentLabel,
														onOpenFile,
														onOpenMarkdownFile,
														onOpenUrl,
														"default",
														false,
														reviewForItem(item),
													),
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
				{dockedPlan && (
					<AcpPlanDock
						key={dockedPlan.id}
						item={dockedPlan}
						review={reviewForItem(dockedPlan)}
					/>
				)}
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
