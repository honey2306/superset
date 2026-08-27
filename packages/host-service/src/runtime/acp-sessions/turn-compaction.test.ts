import { expect, test } from "bun:test";
import type {
	SessionUpdate,
	SessionUpdateEnvelope,
} from "@superset/session-protocol";
import { compactTranscriptTurns } from "./turn-compaction";

function envelope(
	seq: number,
	update: Extract<SessionUpdate, { sessionUpdate: string }>,
	ts = seq * 10,
): SessionUpdateEnvelope {
	return {
		sessionId: "session-1",
		epoch: "epoch-1",
		seq,
		ts,
		frame: { kind: "update", update },
	};
}

test("compacts process envelopes into a durable turn projection", () => {
	const entries = [
		envelope(1, {
			sessionUpdate: "user_message_chunk",
			content: { type: "text", text: "Please inspect this file" },
		}),
		envelope(2, {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "I will inspect it." },
		}),
		envelope(3, {
			sessionUpdate: "tool_call",
			toolCallId: "tool-1",
			title: "Read file",
			kind: "read",
			status: "in_progress",
			locations: [{ path: "/tmp/example.ts", line: 7 }],
			rawInput: { path: "/tmp/example.ts" },
		}),
		envelope(4, {
			sessionUpdate: "tool_call_update",
			toolCallId: "tool-1",
			status: "completed",
			rawOutput: { contents: "raw output must not be persisted" },
		}),
		envelope(5, {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "The file looks good." },
		}),
	];

	const [turn] = compactTranscriptTurns(entries, new Map(), 1);

	expect(turn).toMatchObject({
		sessionId: "session-1",
		epoch: "epoch-1",
		turnNumber: 1,
		startSeq: 1,
		endSeq: 5,
		status: "completed",
		startedAt: 10,
		completedAt: 50,
		durationMs: 40,
		messageCount: 1,
		toolCallCount: 1,
		userMessage: [{ type: "text", text: "Please inspect this file" }],
		assistantMessage: [{ type: "text", text: "The file looks good." }],
		toolSummaries: [
			{
				toolCallId: "tool-1",
				name: "read",
				title: "/tmp/example.ts",
				status: "completed",
				locations: [{ path: "/tmp/example.ts", line: 7 }],
			},
		],
	});
	if (!turn) throw new Error("expected a compacted turn");
	const serialized = JSON.stringify(turn);
	expect(serialized).not.toContain("raw output must not be persisted");
	expect(serialized).not.toContain("rawInput");
});

test("uses an explicit failed or cancelled terminal status", () => {
	const entries = [
		envelope(1, {
			sessionUpdate: "user_message_chunk",
			content: { type: "text", text: "Run the command" },
		}),
		envelope(2, {
			sessionUpdate: "tool_call",
			toolCallId: "tool-1",
			title: "Execute",
			kind: "execute",
			status: "failed",
		}),
	];

	const [failed] = compactTranscriptTurns(
		entries,
		new Map([[1, { status: "failed", completedAt: 80 }]]),
		1,
	);
	const [cancelled] = compactTranscriptTurns(
		entries,
		new Map([[1, { status: "cancelled", completedAt: 90 }]]),
		1,
	);

	expect(failed?.status).toBe("failed");
	expect(failed?.completedAt).toBe(80);
	expect(cancelled?.status).toBe("cancelled");
	expect(cancelled?.completedAt).toBe(90);
});
