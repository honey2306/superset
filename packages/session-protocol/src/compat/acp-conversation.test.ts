import { expect, test } from "bun:test";
import type { SessionUpdate } from "../acp";
import type { SessionUpdateEnvelope } from "../envelope";
import { emptyTimeline, foldEnvelopes } from "../fold";
import { isAskUserPermission } from "../state";
import {
	approvalPlan,
	normalizeAcpUpdate,
	normalizePermission,
} from "./acp-conversation";

function envelopes(
	updates: SessionUpdate[],
	semantic: boolean,
): SessionUpdateEnvelope[] {
	return updates.map((update, i) => ({
		seq: i + 1,
		epoch: "epoch",
		sessionId: "session",
		ts: i + 100,
		frame: {
			kind: "update",
			update,
			...(semantic
				? { event: normalizeAcpUpdate(update, "claude-agent-acp") }
				: {}),
		},
	}));
}
test("live semantic events and legacy journals preserve partial tools, parent linkage and terminal output", () => {
	const updates: SessionUpdate[] = [
		{
			sessionUpdate: "user_message_chunk",
			content: { type: "text", text: "Inspect" },
		},
		{
			sessionUpdate: "tool_call",
			toolCallId: "child",
			title: "Bash",
			kind: "execute",
			_meta: {
				claudeCode: { parentToolUseId: "parent" },
				terminal_info: { terminal_id: "term", cwd: "/repo" },
			},
		},
		{
			sessionUpdate: "tool_call",
			toolCallId: "parent",
			title: "Task",
			rawInput: { prompt: "Inspect repo" },
		},
		{
			sessionUpdate: "tool_call_update",
			toolCallId: "child",
			_meta: { terminal_output: { terminal_id: "term", data: "ready\n" } },
		},
		{
			sessionUpdate: "tool_call_update",
			toolCallId: "child",
			status: "completed",
			_meta: { terminal_exit: { terminal_id: "term", exit_code: 0 } },
		},
		{
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "Done" },
		},
	];
	const live = JSON.parse(
		JSON.stringify(envelopes(updates, true)),
	) as SessionUpdateEnvelope[];
	const expected = foldEnvelopes(emptyTimeline(), envelopes(updates, false));
	expect(foldEnvelopes(emptyTimeline(), live)).toEqual(expected);
	const parent = expected.items.find((item) => item.id === "parent");
	if (parent?.kind !== "tool_call" || parent.children[0]?.kind !== "tool_call")
		throw new Error("Missing nested tool");
	expect(parent.children[0].terminals?.term).toMatchObject({
		output: "ready\n",
		exitCode: 0,
	});
});
test("semantic replay does not need a later provider state frame to merge snapshots", () => {
	const updates: SessionUpdate[] = ["Hello", "Hello world", "Hello world"].map(
		(text) => ({
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text },
		}),
	);
	const history = envelopes(updates, false).map((envelope, i) => ({
		...envelope,
		frame: {
			kind: "update" as const,
			update: updates[i] as SessionUpdate,
			event: normalizeAcpUpdate(updates[i] as SessionUpdate, "pi-acp"),
		},
	}));
	const timeline = foldEnvelopes(emptyTimeline(), history);
	expect(timeline.items).toHaveLength(1);
	expect(timeline.items[0]).toMatchObject({
		blocks: [{ type: "text", text: "Hello world" }],
	});
});
test("domain events take precedence over retained raw diagnostics", () => {
	const raw: SessionUpdate = {
		sessionUpdate: "agent_message_chunk",
		content: { type: "text", text: "raw" },
	};
	const history = envelopes([raw], false);
	const envelope = history[0];
	if (!envelope || envelope.frame.kind !== "update")
		throw new Error("Missing frame");
	envelope.frame.event = {
		version: 1,
		kind: "message",
		role: "agent",
		content: { type: "text", text: "canonical" },
		merge: "delta",
	};
	expect(foldEnvelopes(emptyTimeline(), history).items[0]).toMatchObject({
		blocks: [{ type: "text", text: "canonical" }],
	});
});
test("permission semantics survive serialization without provider metadata", () => {
	const pending = normalizePermission({
		requestId: "q",
		toolCall: {
			toolCallId: "t",
			_meta: { claudeCode: { toolName: "AskUserQuestion" } },
		},
		options: [],
		requestedAt: 1,
	});
	expect(isAskUserPermission(pending, undefined)).toBe(true);
	expect(
		approvalPlan({
			toolCallId: "plan",
			rawInput: { plan: "# Plan", planFilePath: "plan.md" },
		}),
	).toBe("# Plan");
	expect(
		approvalPlan({
			toolCallId: "other",
			rawInput: { plan: "not an approval" },
		}),
	).toBeNull();
});
