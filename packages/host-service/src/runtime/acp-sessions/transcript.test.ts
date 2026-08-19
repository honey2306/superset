import { expect, test } from "bun:test";
import type { SessionUpdateEnvelope } from "@superset/session-protocol";
import { encodeTranscriptCursor } from "@superset/session-protocol";
import { buildTranscriptPage } from "./transcript";

function envelope(
	seq: number,
	sessionUpdate:
		| "user_message_chunk"
		| "agent_message_chunk"
		| "tool_call_update",
): SessionUpdateEnvelope {
	return {
		seq,
		epoch: "epoch-1",
		sessionId: "session-1",
		ts: seq,
		frame: {
			kind: "update",
			update:
				sessionUpdate === "tool_call_update"
					? { sessionUpdate, toolCallId: `tool-${seq}`, status: "completed" }
					: {
							sessionUpdate,
							content: { type: "text", text: `${sessionUpdate}-${seq}` },
						},
		},
	};
}

test("returns whole turns and an accurate index when a turn crosses raw pages", () => {
	const entries = [
		envelope(1, "user_message_chunk"),
		envelope(2, "agent_message_chunk"),
		envelope(3, "tool_call_update"),
		envelope(4, "agent_message_chunk"),
		envelope(5, "user_message_chunk"),
		envelope(6, "agent_message_chunk"),
	];

	const page = buildTranscriptPage(entries, { limit: 1 });

	expect(page.totalTurns).toBe(2);
	expect(page.index.map(({ turnNumber }) => turnNumber)).toEqual([1, 2]);
	expect(page.turns).toHaveLength(1);
	expect(page.turns[0]?.items.map(({ seq }) => seq)).toEqual([5, 6]);
	expect(page.nextCursor).toBe(encodeTranscriptCursor(2));
});

test("loads a requested unloaded turn without exposing raw event pagination", () => {
	const entries = [
		envelope(1, "user_message_chunk"),
		envelope(2, "agent_message_chunk"),
		envelope(3, "user_message_chunk"),
		envelope(4, "agent_message_chunk"),
	];

	const page = buildTranscriptPage(entries, { targetTurn: 1, limit: 1 });

	expect(page.turns.map(({ turnNumber }) => turnNumber)).toEqual([1]);
	expect(page.turns[0]?.items.map(({ seq }) => seq)).toEqual([1, 2]);
	// Rail metadata is always returned, even when only one turn is loaded.
	expect(page.index).toHaveLength(2);
});

test("defaults to the latest eight turns and pages one older turn at a time", () => {
	const entries = Array.from({ length: 20 }, (_, index) =>
		envelope(
			index + 1,
			index % 2 === 0 ? "user_message_chunk" : "agent_message_chunk",
		),
	);

	const latest = buildTranscriptPage(entries);
	expect(latest.totalTurns).toBe(10);
	expect(latest.turns.map(({ turnNumber }) => turnNumber)).toEqual([
		3, 4, 5, 6, 7, 8, 9, 10,
	]);
	expect(latest.nextCursor).toBe(encodeTranscriptCursor(3));

	const older = buildTranscriptPage(entries, {
		cursor: latest.nextCursor ?? undefined,
		limit: 1,
	});
	expect(older.turns.map(({ turnNumber }) => turnNumber)).toEqual([2]);
	expect(older.nextCursor).toBe(encodeTranscriptCursor(2));
});
