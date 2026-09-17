import { expect, test } from "bun:test";
import type { SessionUpdateEnvelope } from "@superset/session-protocol";
import { encodeTranscriptCursor } from "@superset/session-protocol";
import {
	buildTranscriptPage,
	modelHistoryBeforeTurnFromLegacyCursor,
	transcriptTurnFromCompactRecord,
} from "./transcript";

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

test("stops adding older turns at the byte budget but always serves the newest turn", () => {
	const entries = Array.from({ length: 8 }, (_, index) =>
		envelope(
			index + 1,
			index % 2 === 0 ? "user_message_chunk" : "agent_message_chunk",
		),
	);
	const singleTurnBytes = Buffer.byteLength(
		JSON.stringify(buildTranscriptPage(entries, { limit: 1 }).turns[0]),
	);

	// Budget for roughly two turns: the page shrinks but stays pageable.
	const bounded = buildTranscriptPage(entries, {
		maxBytes: singleTurnBytes * 2,
	});
	expect(bounded.totalTurns).toBe(4);
	expect(bounded.turns.map(({ turnNumber }) => turnNumber)).toEqual([3, 4]);
	expect(bounded.nextCursor).toBe(encodeTranscriptCursor(3));
	// The rail index still covers every turn.
	expect(bounded.index).toHaveLength(4);

	// A budget below a single turn still serves exactly the newest turn.
	const minimal = buildTranscriptPage(entries, { maxBytes: 1 });
	expect(minimal.turns.map(({ turnNumber }) => turnNumber)).toEqual([4]);
	expect(minimal.nextCursor).toBe(encodeTranscriptCursor(4));
});

test("rehydrates only compact messages and tool summaries", () => {
	const turn = transcriptTurnFromCompactRecord(
		{
			sessionId: "session-1",
			turnNumber: 1,
			epoch: "epoch-1",
			startSeq: 10,
			endSeq: 20,
			userMessage: [{ type: "text", text: "Inspect it" }],
			assistantMessage: [{ type: "text", text: "Done" }],
			status: "completed",
			startedAt: 100,
			completedAt: 250,
			durationMs: 150,
			messageCount: 1,
			toolCallCount: 1,
			toolSummaries: [
				{
					toolCallId: "tool-1",
					name: "read",
					title: "Read file",
					status: "completed",
					locations: [{ path: "/tmp/example.ts", line: 7 }],
				},
			],
		},
		-3,
	);

	expect(
		turn.items.map((item) =>
			item.frame.kind === "update" ? item.frame.update.sessionUpdate : null,
		),
	).toEqual(["user_message_chunk", "tool_call", "agent_message_chunk"]);
	expect(JSON.stringify(turn.items)).not.toContain("rawInput");
	expect(JSON.stringify(turn.items)).not.toContain("rawOutput");
	expect(turn.startSeq).toBe(-3);
	expect(turn.endSeq).toBe(-1);
	expect(turn.items[1]?.frame).toMatchObject({
		kind: "update",
		update: { toolCallId: "compact:1:tool-1" },
	});
});

test("maps legacy seq cursors onto whole turns without losing unread items", () => {
	// 合成序列：压缩 turn 1（-2..-1）+ 原生 turn 2（1..2）+ turn 3（5..10）。
	const turns = [
		{
			turnNumber: 1,
			startSeq: -2,
			endSeq: -1,
			userPreview: "",
			agentPreview: null,
			isComplete: true,
			items: [],
		},
		{
			turnNumber: 2,
			startSeq: 1,
			endSeq: 2,
			userPreview: "",
			agentPreview: null,
			isComplete: true,
			items: [],
		},
		{
			turnNumber: 3,
			startSeq: 5,
			endSeq: 10,
			userPreview: "",
			agentPreview: null,
			isComplete: true,
			items: [],
		},
	];

	// 游标 s2：上一页已交付 seq 2，turn 2 内 seq 1 仍未读 —— 必须整turn重发。
	expect(modelHistoryBeforeTurnFromLegacyCursor(turns, 2)).toBe(3);
	// 游标 s1：turn 2 内没有更低项，从 turn 1 恢复。
	expect(modelHistoryBeforeTurnFromLegacyCursor(turns, 1)).toBe(2);
	// 游标落在 turn 3 中间：整turn重发，宁重复不丢失。
	expect(modelHistoryBeforeTurnFromLegacyCursor(turns, 8)).toBe(4);
	// 游标落在 turn 2 与 turn 3 之间的非消息帧上：turn 2 全部内容仍未读，
	// 与包含式重发一样不丢数据。
	expect(modelHistoryBeforeTurnFromLegacyCursor(turns, 4)).toBe(3);
	// 游标高于所有序列：从最新开始整页。
	expect(modelHistoryBeforeTurnFromLegacyCursor(turns, 99)).toBe(4);
	// 空历史：遇号到空页而不是抛错。
	expect(modelHistoryBeforeTurnFromLegacyCursor([], 5)).toBe(1);
});
