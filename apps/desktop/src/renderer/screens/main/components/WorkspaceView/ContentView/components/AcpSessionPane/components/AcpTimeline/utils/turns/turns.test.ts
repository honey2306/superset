import { describe, expect, test } from "bun:test";
import type {
	CanonicalToolCall,
	MessageItem,
	TimelineItem,
	ToolCallItem,
	ToolCallSemantics,
} from "@superset/session-protocol";
import {
	getTurnUserMessage,
	groupTurns,
	isTurnAutoCollapsible,
	messagePreviewText,
	turnSummaryText,
} from "./turns";

function userMsg(seq: number, text = "hi"): MessageItem {
	return {
		kind: "message",
		id: `user:${seq}`,
		role: "user",
		blocks: [{ type: "text", text }],
		failed: false,
		startSeq: seq,
		endSeq: seq,
	};
}

function agentMsg(seq: number, text = "ok"): MessageItem {
	return {
		kind: "message",
		id: `agent:${seq}`,
		role: "agent",
		blocks: [{ type: "text", text }],
		failed: false,
		startSeq: seq,
		endSeq: seq,
	};
}

function tool(seq: number, kind = "read"): ToolCallItem {
	const call: CanonicalToolCall = {
		toolCallId: `t${seq}`,
		title: `tool ${seq}`,
		kind: kind as CanonicalToolCall["kind"],
		status: "completed",
		locations: [],
		content: [],
	};
	const semantics: ToolCallSemantics = { kind: "tool" };
	return {
		kind: "tool_call",
		id: `t${seq}`,
		call,
		semantics,
		permissions: [],
		children: [],
		startSeq: seq,
		endSeq: seq,
	};
}

describe("groupTurns", () => {
	test("empty timeline returns no turns", () => {
		expect(groupTurns([])).toEqual([]);
	});

	test("single user + agent message forms one complete turn", () => {
		const items: TimelineItem[] = [userMsg(1), agentMsg(2)];
		const turns = groupTurns(items);
		expect(turns).toHaveLength(1);
		expect(turns[0]?.id).toBe("user:1");
		expect(turns[0]?.isComplete).toBe(true);
		expect(turns[0]?.finalAgentMessage?.id).toBe("agent:2");
		expect(turns[0]?.processItems).toEqual([]);
	});

	test("user + tools + agent — tools go to processItems", () => {
		const items: TimelineItem[] = [
			userMsg(1),
			tool(2, "read"),
			tool(3, "edit"),
			agentMsg(4, "done"),
		];
		const [turn] = groupTurns(items);
		expect(turn?.processItems).toHaveLength(2);
		expect(turn?.finalAgentMessage?.id).toBe("agent:4");
		expect(turn?.toolCallCount).toBe(2);
	});

	test("multi-turn: two user messages produce two turns", () => {
		const items: TimelineItem[] = [
			userMsg(1),
			tool(2),
			agentMsg(3),
			userMsg(4),
			tool(5),
			agentMsg(6),
		];
		const turns = groupTurns(items);
		expect(turns).toHaveLength(2);
		expect(turns[0]?.id).toBe("user:1");
		expect(turns[0]?.processItems.map((i) => i.id)).toEqual(["t2"]);
		expect(turns[1]?.id).toBe("user:4");
		expect(turns[1]?.processItems.map((i) => i.id)).toEqual(["t5"]);
	});

	test("in-flight turn (no final agent message yet) is not complete", () => {
		const items: TimelineItem[] = [userMsg(1), tool(2), tool(3)];
		const [turn] = groupTurns(items);
		expect(turn?.isComplete).toBe(false);
		expect(turn?.finalAgentMessage).toBeNull();
		// Everything after the user message is process — nothing to render as final
		expect(turn?.processItems).toHaveLength(2);
	});

	test("intermediate agent messages fold, only the last agent message is final", () => {
		const items: TimelineItem[] = [
			userMsg(1),
			agentMsg(2, "thinking about this"),
			tool(3),
			agentMsg(4, "final answer"),
		];
		const [turn] = groupTurns(items);
		expect(turn?.finalAgentMessage?.id).toBe("agent:4");
		expect(turn?.processItems).toHaveLength(2);
		expect(turn?.messageCount).toBe(1);
		expect(turn?.toolCallCount).toBe(1);
	});

	test("trailing tool after last agent message stays inline", () => {
		const items: TimelineItem[] = [userMsg(1), tool(2), agentMsg(3), tool(4)];
		const [turn] = groupTurns(items);
		expect(turn?.finalAgentMessage?.id).toBe("agent:3");
		expect(turn?.processItems.map((i) => i.id)).toEqual(["t2"]);
		expect(turn?.trailingItems.map((i) => i.id)).toEqual(["t4"]);
	});

	test("leading agent items (before any user message) form a pre-turn", () => {
		const items: TimelineItem[] = [agentMsg(1, "welcome"), userMsg(2)];
		const turns = groupTurns(items);
		expect(turns).toHaveLength(2);
		expect(turns[0]?.id.startsWith("pre-")).toBe(true);
		expect(turns[0]?.preItems).toHaveLength(1);
		expect(turns[0]?.isComplete).toBe(false);
	});

	test("nested tool_call children count into toolCallCount", () => {
		const parent = tool(2, "other");
		const child = tool(3, "read");
		parent.children = [child];
		const items: TimelineItem[] = [userMsg(1), parent, agentMsg(4)];
		const [turn] = groupTurns(items);
		expect(turn?.toolCallCount).toBe(2);
	});
});

describe("turn previews", () => {
	test("finds the user message and normalizes whitespace", () => {
		const [turn] = groupTurns([
			userMsg(1, "  Explain\n\nthis   change  "),
			agentMsg(2),
		]);
		const userMessage = getTurnUserMessage(turn as NonNullable<typeof turn>);

		expect(userMessage?.id).toBe("user:1");
		expect(messagePreviewText(userMessage as MessageItem)).toBe(
			"Explain this change",
		);
	});

	test("truncates long previews and describes image-only messages", () => {
		expect(messagePreviewText(userMsg(1, "123456789"), 6)).toBe("12345…");
		const imageMessage: MessageItem = {
			...userMsg(2),
			blocks: [{ type: "image", data: "abc", mimeType: "image/png" }],
		};
		expect(messagePreviewText(imageMessage)).toBe("Image");
	});
});

describe("isTurnAutoCollapsible", () => {
	test("last turn also folds when complete (agent already replied)", () => {
		const items: TimelineItem[] = [userMsg(1), tool(2), agentMsg(3)];
		const [turn] = groupTurns(items);
		expect(isTurnAutoCollapsible(turn as NonNullable<typeof turn>, true)).toBe(
			true,
		);
	});

	test("latest turn stays expanded while the session is still active", () => {
		const items: TimelineItem[] = [userMsg(1), tool(2), agentMsg(3), tool(4)];
		const [turn] = groupTurns(items);
		expect(
			isTurnAutoCollapsible(turn as NonNullable<typeof turn>, true, "running"),
		).toBe(false);
	});

	test("earlier complete turn is auto-collapsible", () => {
		const items: TimelineItem[] = [
			userMsg(1),
			tool(2),
			agentMsg(3),
			userMsg(4),
			agentMsg(5),
		];
		const turns = groupTurns(items);
		expect(
			isTurnAutoCollapsible(
				turns[0] as NonNullable<(typeof turns)[number]>,
				false,
			),
		).toBe(true);
	});

	test("in-flight turn never auto-collapses", () => {
		const items: TimelineItem[] = [userMsg(1), tool(2)];
		const [turn] = groupTurns(items);
		expect(isTurnAutoCollapsible(turn as NonNullable<typeof turn>, false)).toBe(
			false,
		);
	});

	test("complete turn with no process items has nothing to collapse", () => {
		const items: TimelineItem[] = [userMsg(1), agentMsg(2)];
		const [turn] = groupTurns(items);
		expect(isTurnAutoCollapsible(turn as NonNullable<typeof turn>, false)).toBe(
			false,
		);
	});
});

describe("turnSummaryText", () => {
	test("counts tools + messages", () => {
		const items: TimelineItem[] = [
			userMsg(1),
			tool(2),
			tool(3),
			agentMsg(4, "thinking"),
			tool(5),
			agentMsg(6, "final"),
		];
		const [turn] = groupTurns(items);
		expect(turnSummaryText(turn as NonNullable<typeof turn>)).toBe(
			"执行过程:3 次工具调用，1 条消息".replace(":", "："),
		);
	});

	test("only tools", () => {
		const items: TimelineItem[] = [userMsg(1), tool(2), agentMsg(3)];
		const [turn] = groupTurns(items);
		expect(turnSummaryText(turn as NonNullable<typeof turn>)).toBe(
			"执行过程:1 次工具调用".replace(":", "："),
		);
	});

	test("empty process has fallback label", () => {
		const items: TimelineItem[] = [userMsg(1), agentMsg(2)];
		const [turn] = groupTurns(items);
		expect(turnSummaryText(turn as NonNullable<typeof turn>)).toBe("执行过程");
	});
});
