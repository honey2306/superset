import {
	decodeTranscriptCursor,
	encodeTranscriptCursor,
	groupTranscriptTurns,
	type SessionUpdateEnvelope,
	type TranscriptPage,
} from "@superset/session-protocol";

export interface TranscriptPageOptions {
	cursor?: string;
	targetTurn?: number;
	limit?: number;
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
