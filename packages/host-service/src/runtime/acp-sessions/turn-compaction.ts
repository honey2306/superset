import {
	type ContentBlock,
	emptyTimeline,
	foldEnvelopes,
	groupTranscriptTurns,
	type SessionUpdateEnvelope,
	type TimelineItem,
	type ToolCallLocation,
	type TranscriptToolSummary,
	type TranscriptTurn,
	type TranscriptTurnStatus,
} from "@superset/session-protocol";
import type { AcpSessionTurnRecord } from "./persistence";

/** Terminal facts supplied by the host's prompt lifecycle. */
export interface TurnCompletion {
	status: TranscriptTurnStatus;
	completedAt: number;
	startedAt?: number;
}

/**
 * Project raw ACP envelopes into the small durable shape used after a turn
 * settles. The caller owns the transaction which writes the returned records
 * and removes the source journal. This function deliberately only copies
 * user/final-assistant blocks and canonical tool metadata; raw tool input,
 * output, streaming chunks, permissions, and state frames stay behind.
 */
export function compactTranscriptTurns(
	entries: readonly SessionUpdateEnvelope[],
	completions: ReadonlyMap<number, TurnCompletion>,
	firstTurnNumber = 1,
): AcpSessionTurnRecord[] {
	return groupTranscriptTurns(entries).map((turn, index) =>
		compactTranscriptTurn(
			turn,
			completions.get(turn.startSeq),
			firstTurnNumber + index,
		),
	);
}

function compactTranscriptTurn(
	turn: TranscriptTurn,
	completion: TurnCompletion | undefined,
	turnNumber: number,
): AcpSessionTurnRecord {
	const timeline = foldEnvelopes(emptyTimeline(), [...turn.items]);
	const userIndex = timeline.items.findIndex(
		(item) => item.kind === "message" && item.role === "user",
	);
	const userItem = userIndex >= 0 ? timeline.items[userIndex] : undefined;
	const body = timeline.items.slice(userIndex >= 0 ? userIndex + 1 : 0);
	let finalAgentIndex = -1;
	for (let index = body.length - 1; index >= 0; index -= 1) {
		const item = body[index];
		if (item?.kind === "message" && item.role === "agent") {
			finalAgentIndex = index;
			break;
		}
	}
	const finalAgent = finalAgentIndex >= 0 ? body[finalAgentIndex] : undefined;
	// The final agent message is retained separately. Every other body item is
	// process data, including a rare trailing tool call that arrives after the
	// final text chunk. Keeping that metadata is important for a terminal turn:
	// the raw trailing frame is about to be deleted just like the leading work.
	const processItems = body.filter((_, index) => index !== finalAgentIndex);
	const startedAt =
		completion?.startedAt ?? turn.startedAt ?? turn.items[0]?.ts ?? Date.now();
	const completedAt =
		completion?.completedAt ?? turn.items.at(-1)?.ts ?? startedAt;
	const status =
		completion?.status ?? (turn.isComplete ? "completed" : "failed");

	return {
		sessionId: turn.items[0]?.sessionId ?? "",
		epoch: turn.items[0]?.epoch ?? "",
		turnNumber,
		startSeq: turn.startSeq,
		endSeq: turn.endSeq,
		userMessage:
			userItem?.kind === "message" && userItem.role === "user"
				? cloneBlocks(userItem.blocks)
				: [],
		assistantMessage:
			finalAgent?.kind === "message" && finalAgent.role === "agent"
				? cloneBlocks(finalAgent.blocks)
				: null,
		status,
		startedAt,
		completedAt,
		durationMs: Math.max(0, completedAt - startedAt),
		messageCount: processItems.filter((item) => item.kind === "message").length,
		toolCallCount: countToolCalls(processItems),
		toolSummaries: summarizeToolCalls(processItems),
	};
}

function cloneBlocks(blocks: readonly ContentBlock[]): ContentBlock[] {
	return [...blocks];
}

function countToolCalls(items: readonly TimelineItem[]): number {
	let count = 0;
	for (const item of items) {
		if (item.kind === "tool_call") count += 1 + countToolCalls(item.children);
	}
	return count;
}

function summarizeToolCalls(
	items: readonly TimelineItem[],
): TranscriptToolSummary[] {
	const summaries: TranscriptToolSummary[] = [];
	for (const item of items) {
		if (item.kind !== "tool_call") continue;
		summaries.push({
			toolCallId: item.id,
			name: item.call.kind,
			title: item.call.title,
			status: item.call.status,
			locations: compactLocations(item.call.locations),
		});
		summaries.push(...summarizeToolCalls(item.children));
	}
	return summaries;
}

function compactLocations(
	locations: readonly ToolCallLocation[],
): ToolCallLocation[] {
	return locations.map((location) =>
		location.line === undefined || location.line === null
			? { path: location.path }
			: { path: location.path, line: location.line },
	);
}
