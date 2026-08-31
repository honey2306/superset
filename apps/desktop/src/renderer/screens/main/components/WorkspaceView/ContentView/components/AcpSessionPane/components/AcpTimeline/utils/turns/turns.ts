import type { SessionStatus, TimelineItem } from "@superset/session-protocol";

/**
 * A "turn" is the span between two consecutive user messages (or timeline
 * start → first user, or last user → end). Within a turn, everything except
 * the *final* agent message is the agent's working process — tool calls and
 * intermediate agent text/thoughts. Mainstream agent UIs (Claude.ai, Cursor,
 * ChatGPT) collapse this process behind a one-line summary once the turn is
 * finished, so the transcript reads as "user asked → agent answered" instead
 * of a wall of intermediate scaffolding.
 *
 * `groupTurns` walks the timeline and returns, per turn:
 *   - `preItems`: items that always render inline (the user message, and any
 *     leading items before the very first user message).
 *   - `processItems`: process entries before the last agent message. Tool
 *     calls collapse behind the summary; agent messages remain readable.
 *   - `finalAgentMessage`: the last agent message in this turn (if any). This
 *     is the "assistant reply" the user actually reads; it always renders.
 *   - `trailingItems`: working items emitted after the latest agent message.
 *     They retain their chronological position when expanded, but share the
 *     same process summary; text messages remain visible while tools fold.
 *   - `isComplete`: true when the turn has a final agent message. Once that
 *     response starts streaming, all surrounding process items can collapse;
 *     an in-flight turn with no agent message renders everything inline so the
 *     user sees live progress.
 *
 * Plan items live outside the turn model — they are separated by the pane's
 * dock renderer before we get here, so this function only sees message +
 * tool_call. Plan items that survive filtering are treated as pre-items.
 */

export type TurnGroupItem =
	| Extract<TimelineItem, { kind: "message" }>
	| Extract<TimelineItem, { kind: "tool_call" }>
	| Extract<TimelineItem, { kind: "plan" }>;

export interface Turn {
	/** Stable id for React keys: the user message id, or `pre-${first id}`. */
	id: string;
	preItems: TurnGroupItem[];
	processItems: TurnGroupItem[];
	finalAgentMessage: Extract<TimelineItem, { kind: "message" }> | null;
	trailingItems: TurnGroupItem[];
	isComplete: boolean;
	/** Counts used by the collapsed summary label. */
	toolCallCount: number;
	messageCount: number;
}

type TimelineMessage = Extract<TimelineItem, { kind: "message" }>;
type UserMessage = TimelineMessage & { role: "user" };
type AgentMessage = TimelineMessage & { role: "agent" };

function isUserMessage(item: TimelineItem): item is UserMessage {
	return item.kind === "message" && item.role === "user";
}

export function getTurnUserMessage(turn: Turn): UserMessage | null {
	const userMessage = turn.preItems.find(isUserMessage);
	return userMessage ?? null;
}

export function messagePreviewText(
	message: Extract<TimelineItem, { kind: "message" }>,
	maxLength = 240,
): string {
	const text = message.blocks
		.flatMap((block) => (block.type === "text" ? [block.text] : []))
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();

	if (!text) {
		if (message.blocks.some((block) => block.type === "image")) return "Image";
		if (message.blocks.some((block) => block.type === "audio")) return "Audio";
		return "Attachment";
	}
	if (text.length <= maxLength) return text;
	return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function isAgentMessage(item: TimelineItem): item is AgentMessage {
	return item.kind === "message" && item.role === "agent";
}

function countToolCallsDeep(items: readonly TimelineItem[]): number {
	let total = 0;
	for (const item of items) {
		if (item.kind === "tool_call") {
			total += 1 + countToolCallsDeep(item.children);
		}
	}
	return total;
}

/**
 * Split a flat timeline into turns using user messages as separators.
 * Anything before the first user message is a "pre-turn" run rendered
 * inline (typically an agent greeting or a system announcement).
 */
export function groupTurns(items: readonly TimelineItem[]): Turn[] {
	const turns: Turn[] = [];

	// Collect leading non-user items as a synthetic pre-turn.
	let cursor = 0;
	const first = items[0];
	if (first && !isUserMessage(first)) {
		const preRun: TurnGroupItem[] = [];
		while (cursor < items.length) {
			const item = items[cursor];
			if (!item || isUserMessage(item)) break;
			preRun.push(item as TurnGroupItem);
			cursor += 1;
		}
		const head = preRun[0];
		if (head) {
			turns.push({
				id: `pre-${head.id}`,
				preItems: preRun,
				processItems: [],
				finalAgentMessage: null,
				trailingItems: [],
				isComplete: false,
				toolCallCount: 0,
				messageCount: 0,
			});
		}
	}

	while (cursor < items.length) {
		const user = items[cursor];
		if (!user || !isUserMessage(user)) {
			cursor += 1;
			continue;
		}

		const startIdx = cursor;
		cursor += 1;
		// Walk forward until the next user message or the end.
		while (cursor < items.length) {
			const nextItem = items[cursor];
			if (!nextItem || isUserMessage(nextItem)) break;
			cursor += 1;
		}
		const endIdx = cursor; // exclusive

		const body = items.slice(startIdx + 1, endIdx) as TurnGroupItem[];

		// Find the LAST agent message in this turn — that's the "final reply".
		let finalAgentIdx = -1;
		for (let i = body.length - 1; i >= 0; i -= 1) {
			const bodyItem = body[i];
			if (bodyItem && isAgentMessage(bodyItem)) {
				finalAgentIdx = i;
				break;
			}
		}

		const processItems =
			finalAgentIdx >= 0 ? body.slice(0, finalAgentIdx) : body;
		const finalAgentMessage =
			finalAgentIdx >= 0
				? (body[finalAgentIdx] as Extract<TimelineItem, { kind: "message" }>)
				: null;
		const trailingItems =
			finalAgentIdx >= 0 ? body.slice(finalAgentIdx + 1) : [];

		const collapsibleItems = [...processItems, ...trailingItems];
		const toolCallCount = countToolCallsDeep(collapsibleItems);
		const messageCount = collapsibleItems.filter(
			(item) => item.kind === "message",
		).length;

		turns.push({
			id: user.id,
			preItems: [user],
			processItems,
			finalAgentMessage,
			trailingItems,
			isComplete: finalAgentMessage !== null,
			toolCallCount,
			messageCount,
		});
	}

	return turns;
}

/**
 * A turn folds by default once it has a final agent message and process items.
 * The latest turn can fold while the authoritative session status is still
 * active: the latest message stays readable while process items on either
 * side remain under the same summary. User-driven expansion remains local to
 * AcpTimeline; this predicate only chooses the initial default.
 */
export function isTurnSettled(
	turn: Turn,
	isLastTurn: boolean,
	status?: SessionStatus,
): boolean {
	if (!turn.isComplete) return false;
	if (!isLastTurn) return true;
	return (
		status !== "starting" &&
		status !== "running" &&
		status !== "awaiting_permission"
	);
}

export function isTurnAutoCollapsible(
	turn: Turn,
	isLastTurn: boolean,
	status?: SessionStatus,
): boolean {
	if (!turn.isComplete) return false;
	if (turn.processItems.length === 0 && turn.trailingItems.length === 0)
		return false;
	// A final agent message remains readable even while the session is still
	// streaming work. Collapse all surrounding process items as soon as that
	// answer starts rendering.
	if (isLastTurn) return true;
	return isTurnSettled(turn, isLastTurn, status);
}

/** Human-readable summary text. Format: `执行过程：N 次工具调用，M 条消息`. */
export function turnSummaryText(turn: Turn): string {
	const parts: string[] = [];
	if (turn.toolCallCount > 0) parts.push(`${turn.toolCallCount} 次工具调用`);
	if (turn.messageCount > 0) parts.push(`${turn.messageCount} 条消息`);
	if (parts.length === 0) return "执行过程";
	return `执行过程：${parts.join("，")}`;
}
