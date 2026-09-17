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
	/** Test seam; production callers use the default transport-safe budget. */
	maxBytes?: number;
}

/**
 * Upper bound for one transcript page's turn payload. Transcript pages travel
 * as a single newline-delimited JSON frame over the daemon socket (16 MiB
 * hard limit), so a fixed turn count alone cannot bound the response: eight
 * screenshot-heavy turns can exceed the transport limit and make the session
 * impossible to open. Matches the getMessages page budget.
 */
const MAX_TRANSCRIPT_PAGE_BYTES = 8 * 1024 * 1024;

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
 * Map a legacy `s<seq>` messages cursor — issued by builds that paged the raw
 * journal before message-only projection — onto transcript turn numbering.
 * The old cursor means "items strictly below seq are still unread", so every
 * turn whose first frame is below the seq must be re-served; the turn the seq
 * lands inside is included whole: a few already-delivered chunks may repeat,
 * but none are lost. Uniform formula: turns starting below + 1. A seq in the
 * pre-turn bootstrap region (state/usage frames the old build paged through)
 * or above every seq degrades to the same count.
 */
export function modelHistoryBeforeTurnFromLegacyCursor(
	turns: readonly TranscriptTurn[],
	seq: number,
): number {
	let below = 0;
	for (const turn of turns) {
		if (turn.startSeq < seq) below += 1;
	}
	return below + 1;
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
	let startIndex = Math.max(0, endIndex - limit);
	// The newest selected turn is always served so progress is possible; older
	// turns are included only while the page stays under the byte budget.
	const maxBytes = options.maxBytes ?? MAX_TRANSCRIPT_PAGE_BYTES;
	let bytes = 0;
	let boundedStart = endIndex;
	for (let index = endIndex - 1; index >= startIndex; index -= 1) {
		const turnBytes = Buffer.byteLength(JSON.stringify(turns[index]));
		if (boundedStart < endIndex && bytes + turnBytes > maxBytes) break;
		bytes += turnBytes;
		boundedStart = index;
	}
	startIndex = boundedStart;
	const selected = turns.slice(startIndex, endIndex);
	return {
		turns: selected,
		index,
		totalTurns,
		nextCursor: startIndex > 0 ? encodeTranscriptCursor(startIndex + 1) : null,
	};
}
