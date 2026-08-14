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
	type UIEvent,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { AcpEmptyState } from "../AcpEmptyState";
import { AcpMessageItem } from "./components/AcpMessageItem";
import { AcpPlanDock } from "./components/AcpPlanDock";
import { AcpPlanItem } from "./components/AcpPlanItem";
import { AcpSubagentItem } from "./components/AcpSubagentItem";
import { AcpToolCallItem } from "./components/AcpToolCallItem";
import { AcpUnknownContent } from "./components/AcpUnknownContent";

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

/**
 * A running session can have a short quiet interval between ACP frames. The
 * latest item supplies sufficient activity feedback when it is a streaming
 * message/thought or a pending tool; otherwise render a lightweight indicator.
 */
export function shouldShowWorkingIndicator(
	items: readonly TimelineItem[],
	status?: SessionStatus,
): boolean {
	if (status !== "running") return false;

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
		return <AcpMessageItem key={item.id} item={item} agentLabel={agentLabel} />;
	}
	if (item.kind === "tool_call") {
		if (item.children.length > 0) {
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

export const AcpTimeline = forwardRef<AcpTimelineHandle, AcpTimelineProps>(
	function AcpTimeline(
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
		},
		ref,
	) {
		const scrollRef = useRef<HTMLDivElement>(null);
		const [autoFollow, setAutoFollow] = useState(true);
		const [showJumpButton, setShowJumpButton] = useState(false);
		const hasInitiallyScrolledRef = useRef(false);
		// Guarded while a programmatic smooth-scroll to a user message is running.
		// Without it, the first onScroll frames still read as "near bottom" (the
		// viewport hasn't moved yet), autoFollow flips back to true, and the follow
		// effect below snaps to scrollHeight — cancelling the smooth scroll.
		const isJumpingToUserRef = useRef(false);
		const jumpEndTimerRef = useRef<number | null>(null);

		const isNearBottom = useCallback((el: HTMLElement): boolean => {
			return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
		}, []);

		const handleScroll = useCallback(
			(e: UIEvent<HTMLDivElement>) => {
				if (isJumpingToUserRef.current) return;
				const el = e.currentTarget;
				const near = isNearBottom(el);
				setAutoFollow(near);
				setShowJumpButton(!near);
			},
			[isNearBottom],
		);

		const scrollToBottom = useCallback(() => {
			const el = scrollRef.current;
			if (!el) return;
			el.scrollTop = el.scrollHeight;
			setAutoFollow(true);
			setShowJumpButton(false);
		}, []);

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
			};
		}, []);

		useEffect(() => {
			const el = scrollRef.current;
			if (!el) return;
			if (timeline.items.length === 0) return;
			// Never fight an in-flight jump-to-user smooth scroll.
			if (isJumpingToUserRef.current) return;
			if (!hasInitiallyScrolledRef.current || autoFollow) {
				el.scrollTop = el.scrollHeight;
				hasInitiallyScrolledRef.current = true;
			}
		}, [timeline.items, autoFollow]);

		const showWorkingIndicator = shouldShowWorkingIndicator(
			timeline.items,
			status,
		);
		const activePlan = timeline.items.findLast(
			(item): item is PlanItem => item.kind === "plan" && !item.removed,
		);
		const visibleItems = activePlan
			? timeline.items.filter((item) => item.id !== activePlan.id)
			: timeline.items;
		const workingIndicator = showWorkingIndicator && (
			<output className="acp-timeline__working">
				<span className="acp-blink" aria-hidden>
					●
				</span>
				Working…
			</output>
		);

		if (timeline.items.length === 0) {
			return (
				<div className="acp-pane__timeline">
					<div className={cn("acp-pane__scroll", className)}>
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
				<div
					className={cn("acp-pane__scroll", className)}
					ref={scrollRef}
					onScroll={handleScroll}
				>
					<div className="acp-pane__body-inner">
						{visibleItems.map((item) =>
							renderItem(item, onRespond, agentLabel, onOpenFile),
						)}
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
	},
);
