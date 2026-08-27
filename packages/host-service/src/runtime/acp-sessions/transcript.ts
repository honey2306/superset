import {
	type ContentBlock,
	decodeTranscriptCursor,
	encodeTranscriptCursor,
	groupTranscriptTurns,
	type SessionUpdateEnvelope,
	type TranscriptPage,
	type TranscriptTurn,
} from "@superset/session-protocol";
import type { AcpSessionTurnRecord } from "./persistence";

export interface TranscriptPageOptions {
	cursor?: string;
	targetTurn?: number;
	limit?: number;
}

/**
 * Rehydrate the protocol view of a compact turn without recreating the raw
 * process journal. The synthetic envelopes contain only the retained user and
 * final assistant blocks; callers that need process details use the explicit
 * summary fields on the turn instead.
 */
export function transcriptTurnFromCompactRecord(
	record: AcpSessionTurnRecord,
	/**
	 * Compact turns can come from many journal epochs, each of which starts at
	 * seq 1. Give transcript-only envelopes a separate sequence range so the
	 * renderer's seq-keyed merge cannot collapse two historical turns together.
	 */
	syntheticStartSeq = record.startSeq,
): TranscriptTurn {
	const items = compactMessageEnvelopes(record, syntheticStartSeq);
	return {
		turnNumber: record.turnNumber,
		startSeq: syntheticStartSeq,
		endSeq: items.at(-1)?.seq ?? syntheticStartSeq,
		userPreview: previewBlocks(record.userMessage, "Message"),
		agentPreview: record.assistantMessage
			? previewBlocks(record.assistantMessage, "No text response")
			: null,
		// A failed/cancelled turn may have no assistant response at all. Keep the
		// terminal status in the summary, but preserve the transcript's semantic
		// `isComplete` meaning for renderers that use it to decide whether there is
		// a final reply to show.
		isComplete: record.assistantMessage !== null,
		status: record.status,
		startedAt: record.startedAt,
		completedAt: record.completedAt,
		durationMs: record.durationMs,
		messageCount: record.messageCount,
		toolCallCount: record.toolCallCount,
		toolSummaries: record.toolSummaries.map((summary) => ({
			...summary,
			locations: summary.locations.map((location) => ({ ...location })),
		})),
		userMessage: [...record.userMessage],
		assistantMessage: record.assistantMessage
			? [...record.assistantMessage]
			: null,
		items,
	};
}

function previewBlocks(
	blocks: readonly ContentBlock[],
	fallback: string,
): string {
	const text = blocks
		.filter(
			(block): block is Extract<ContentBlock, { type: "text" }> =>
				block.type === "text",
		)
		.map((block) => block.text)
		.join(" ");
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return fallback;
	if (normalized.length <= 240) return normalized;
	return `${normalized.slice(0, 239).trimEnd()}…`;
}

function compactMessageEnvelopes(
	record: AcpSessionTurnRecord,
	startSeq: number,
): SessionUpdateEnvelope[] {
	const userItems = record.userMessage.map((content, index) => ({
		sessionId: record.sessionId,
		epoch: record.epoch,
		seq: startSeq + index,
		ts: record.startedAt,
		frame: {
			kind: "update" as const,
			update: {
				sessionUpdate: "user_message_chunk" as const,
				content,
			},
		},
	}));
	const toolStart = startSeq + userItems.length;
	const toolItems = record.toolSummaries.map((summary, index) => ({
		sessionId: record.sessionId,
		epoch: record.epoch,
		seq: toolStart + index,
		ts: record.completedAt,
		frame: {
			kind: "update" as const,
			update: {
				sessionUpdate: "tool_call" as const,
				// Tool ids are provider-owned and are not guaranteed unique across
				// loaded sessions/epochs. Namespace only the synthetic renderer item.
				toolCallId: `compact:${record.turnNumber}:${summary.toolCallId}`,
				title: summary.title,
				status: summary.status,
				locations: summary.locations.map((location) => ({ ...location })),
			},
		},
	}));
	const assistant = record.assistantMessage ?? [];
	const assistantStart = toolStart + toolItems.length;
	const assistantItems = assistant.map((content, index) => ({
		sessionId: record.sessionId,
		epoch: record.epoch,
		seq: assistantStart + index,
		ts: record.completedAt,
		frame: {
			kind: "update" as const,
			update: {
				sessionUpdate: "agent_message_chunk" as const,
				content,
			},
		},
	}));
	return [...userItems, ...toolItems, ...assistantItems];
}

/**
 * Builds a semantic page from the journal snapshot. The index is intentionally
 * cheap (turn boundaries and previews only) and is returned with every page so
 * a renderer can show the complete rail before it fetches every turn.
 */
export function buildTranscriptPage(
	entries: readonly SessionUpdateEnvelope[],
	options: TranscriptPageOptions = {},
): TranscriptPage {
	return buildTranscriptPageFromTurns(groupTranscriptTurns(entries), options);
}

export function buildTranscriptPageFromTurns(
	turns: ReturnType<typeof groupTranscriptTurns>,
	options: TranscriptPageOptions = {},
): TranscriptPage {
	const index = turns.map(({ items: _items, ...summary }) => summary);
	const totalTurns = turns.length;
	const limit = Math.max(1, Math.min(50, options.limit ?? 8));

	if (options.targetTurn !== undefined) {
		const target = turns[options.targetTurn - 1];
		return {
			turns: target ? [target] : [],
			index,
			totalTurns,
			nextCursor:
				target && target.turnNumber > 1
					? encodeTranscriptCursor(target.turnNumber)
					: null,
		};
	}

	let beforeTurn: number | undefined;
	if (options.cursor !== undefined) {
		beforeTurn = decodeTranscriptCursor(options.cursor) ?? undefined;
		if (beforeTurn === undefined) {
			throw new Error(`Invalid transcript cursor: ${options.cursor}`);
		}
	}
	const endExclusive = Math.min(totalTurns + 1, beforeTurn ?? totalTurns + 1);
	const endIndex = Math.max(0, endExclusive - 1);
	const startIndex = Math.max(0, endIndex - limit);
	const selected = turns.slice(startIndex, endIndex);
	return {
		turns: selected,
		index,
		totalTurns,
		nextCursor: startIndex > 0 ? encodeTranscriptCursor(startIndex + 1) : null,
	};
}
