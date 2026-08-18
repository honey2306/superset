import { expect, test } from "bun:test";
import type { SessionUpdateEnvelope } from "./envelope";
import { groupTranscriptTurns } from "./transcript";

function envelope(
	seq: number,
	sessionUpdate:
		| "user_message_chunk"
		| "agent_message_chunk"
		| "tool_call_update",
	text = `${sessionUpdate}-${seq}`,
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
					? {
							sessionUpdate,
							toolCallId: `tool-${seq}`,
							status: "completed",
						}
					: {
							sessionUpdate,
							content: { type: "text", text },
						},
		},
	};
}

test("groups a turn across raw page boundaries without splitting chunks", () => {
	const entries = [
		envelope(1, "user_message_chunk", "question"),
		envelope(2, "agent_message_chunk", "first markdown chunk"),
		envelope(3, "tool_call_update"),
		envelope(4, "agent_message_chunk", "final markdown chunk"),
		envelope(5, "user_message_chunk", "next question"),
		envelope(6, "agent_message_chunk", "next answer"),
	];

	const turns = groupTranscriptTurns(entries);

	expect(turns).toHaveLength(2);
	expect(turns[0]?.turnNumber).toBe(1);
	expect(turns[0]?.items.map(({ seq }) => seq)).toEqual([1, 2, 3, 4]);
	expect(turns[0]?.startSeq).toBe(1);
	expect(turns[0]?.endSeq).toBe(4);
	expect(turns[1]?.items.map(({ seq }) => seq)).toEqual([5, 6]);
});

test("does not count adjacent user chunks from one prompt as separate turns", () => {
	const turns = groupTranscriptTurns([
		envelope(1, "user_message_chunk", "text"),
		envelope(2, "user_message_chunk", "image"),
		envelope(3, "agent_message_chunk", "answer"),
	]);

	expect(turns).toHaveLength(1);
	expect(turns[0]?.items.map(({ seq }) => seq)).toEqual([1, 2, 3]);
});
