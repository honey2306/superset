import { describe, expect, test } from "bun:test";
import { stripAnsi } from "../lib/output";
import {
	caretPosition,
	claudeComposerLines,
	isComposerNewlineKey,
	isComposerSubmitKey,
	isRunningSessionStatus,
	messageLines,
	parseMouseScrollBody,
	recentSessionCandidates,
	selectedSlashCommandInput,
	sessionPickerEntries,
	splitStreamingAgentMessage,
	workspacesForProject,
	wrapComposer,
} from "./chat";

describe("slash command menu selection", () => {
	test("Enter replaces a typed prefix with the highlighted command", () => {
		expect(selectedSlashCommandInput("/s", "/status")).toBe("/status");
		expect(selectedSlashCommandInput("/per", "/permissions")).toBe(
			"/permissions",
		);
	});

	test("preserves arguments while completing the command", () => {
		expect(selectedSlashCommandInput("/sw session-id", "/switch")).toBe(
			"/switch session-id",
		);
	});
});

describe("streaming agent projection", () => {
	test("renders the active agent message only in the streaming slot", () => {
		const messages = [
			{ role: "user" as const, text: "question" },
			{ role: "agent" as const, text: "partial answer" },
		];

		expect(splitStreamingAgentMessage(messages, true)).toEqual({
			committed: [{ role: "user", text: "question" }],
			streamingText: "partial answer",
		});
	});

	test("commits the agent message after the turn finishes", () => {
		const messages = [
			{ role: "user" as const, text: "question" },
			{ role: "agent" as const, text: "final answer" },
		];

		expect(splitStreamingAgentMessage(messages, false)).toEqual({
			committed: messages,
			streamingText: "",
		});
	});
});

describe("new conversation targeting", () => {
	test("filters workspaces to the selected project", () => {
		const workspaces = [
			{
				id: "w1",
				name: "main",
				projectId: "p1",
				worktreePath: "/one",
				branch: "main",
				type: "main" as const,
			},
			{
				id: "w2",
				name: "feature",
				projectId: "p2",
				worktreePath: "/two",
				branch: "feature",
				type: "worktree" as const,
			},
		];
		expect(workspacesForProject(workspaces, "p2").map(({ id }) => id)).toEqual([
			"w2",
		]);
	});
});

describe("session picker", () => {
	test("puts the new-conversation entry first when not searching", () => {
		const entries = sessionPickerEntries([{ id: "s1" }], "");
		expect(entries.map(({ kind }) => kind)).toEqual(["new", "session"]);
	});

	test("hides the synthetic entry while searching", () => {
		const entries = sessionPickerEntries([{ id: "s1" }], "query");
		expect(entries.map(({ kind }) => kind)).toEqual(["session"]);
	});
});

describe("running session attachment", () => {
	test("treats starting and running as live sessions", () => {
		expect(isRunningSessionStatus("starting")).toBe(true);
		expect(isRunningSessionStatus("running")).toBe(true);
		expect(isRunningSessionStatus("idle")).toBe(false);
		expect(isRunningSessionStatus("offline")).toBe(false);
	});
});

describe("Claude-style composer", () => {
	test("uses full-width rules without box side borders", () => {
		const lines = claudeComposerLines([{ text: "hello", start: 0 }], 20);
		expect(lines.map(stripAnsi)).toEqual([
			"────────────────────",
			"❯ hello",
			"────────────────────",
		]);
		expect(lines.join("\n")).not.toContain("│");
		expect(lines.join("\n")).not.toContain("╭");
		expect(lines.join("\n")).not.toContain("╯");
	});
});

describe("conversation message layout", () => {
	test("matches Claude: inline role glyphs and hanging indentation", () => {
		const user = messageLines({ role: "user", text: "第一行\n第二行" });
		const agent = messageLines(
			{ role: "agent", text: "已经完成\n\n- 结果" },
			"pi",
		);
		expect(stripAnsi(user[0] ?? "")).toBe("❯ 第一行");
		expect(user[0]).toContain("\x1b[36m第一行");
		expect(stripAnsi(user[1] ?? "")).toBe("  第二行");
		expect(user[1]).toContain("\x1b[36m第二行");
		expect(user.at(-1)).toBe("");
		expect(stripAnsi(agent[0] ?? "")).toBe("● pi");
		expect(agent[1]).toBe("");
		expect(stripAnsi(agent[2] ?? "")).toBe("  已经完成");
		expect(stripAnsi(agent[4] ?? "")).toBe("  - 结果");
		expect(agent.at(-1)).toBe("");
		expect(user.join("\n")).not.toContain("48;2;52;55;70");
	});
});

describe("mouse scroll parsing", () => {
	test("parses SGR wheel report bodies emitted by readline", () => {
		expect(parseMouseScrollBody("64;20;10M")).toEqual({ delta: 3 });
		expect(parseMouseScrollBody("65;1;2m")).toEqual({ delta: -3 });
	});

	test("ignores keyboard and partial reports", () => {
		expect(parseMouseScrollBody("A")).toBeUndefined();
		expect(parseMouseScrollBody("64;20;10")).toBeUndefined();
	});
});

describe("recentSessionCandidates", () => {
	const now = Date.UTC(2026, 8, 6, 12);

	test("keeps sessions active within the last two rolling days", () => {
		const sessions = [
			{ sessionId: "recent", createdAt: now - 10_000, updatedAt: now - 10_000 },
			{
				sessionId: "boundary",
				createdAt: now - 1_000_000,
				updatedAt: now - 2 * 24 * 60 * 60 * 1000,
			},
			{
				sessionId: "old",
				createdAt: now - 1_000,
				updatedAt: now - 2 * 24 * 60 * 60 * 1000 - 1,
			},
		];

		expect(
			recentSessionCandidates(sessions, now).map(({ sessionId }) => sessionId),
		).toEqual(["recent", "boundary"]);
	});

	test("orders the picker by latest activity", () => {
		const sessions = [
			{ sessionId: "created-later", createdAt: now, updatedAt: now - 60_000 },
			{ sessionId: "active-now", createdAt: now - 60_000, updatedAt: now },
		];
		expect(
			recentSessionCandidates(sessions, now).map(({ sessionId }) => sessionId),
		).toEqual(["active-now", "created-later"]);
	});

	test("uses latest activity rather than creation time", () => {
		const sessions = [
			{
				sessionId: "resumed",
				createdAt: now - 30 * 24 * 60 * 60 * 1000,
				updatedAt: now - 60_000,
			},
		];
		expect(recentSessionCandidates(sessions, now)).toHaveLength(1);
	});
});

describe("composer key semantics", () => {
	test("Enter and Return both submit across terminal encodings", () => {
		expect(isComposerSubmitKey({ name: "enter" })).toBe(true);
		expect(isComposerSubmitKey({ name: "return" })).toBe(true);
	});

	test("modified Enter inserts a newline instead of submitting", () => {
		expect(isComposerNewlineKey({ name: "enter", ctrl: true })).toBe(false);
		expect(isComposerNewlineKey({ name: "return", shift: true })).toBe(true);
		expect(isComposerNewlineKey({ name: "return", meta: true })).toBe(true);
		expect(isComposerNewlineKey({ name: "enter" })).toBe(false);
	});
});

function locate(text: string, cursor: number, width: number) {
	const rows = wrapComposer(text, width);
	return caretPosition(rows, text, cursor);
}

describe("wrapComposer", () => {
	test("单行文本占一行，起点为 0", () => {
		expect(wrapComposer("hello", 20)).toEqual([{ text: "hello", start: 0 }]);
	});

	test("空文本仍产生一行，让光标有落点", () => {
		expect(wrapComposer("", 20)).toEqual([{ text: "", start: 0 }]);
	});

	test("显式换行分行，且偏移跳过换行符本身", () => {
		expect(wrapComposer("ab\ncd", 20)).toEqual([
			{ text: "ab", start: 0 },
			{ text: "cd", start: 3 },
		]);
	});

	test("超宽硬折行，偏移指向该行首字符在 buffer 中的位置", () => {
		expect(wrapComposer("abcdef", 3)).toEqual([
			{ text: "abc", start: 0 },
			{ text: "def", start: 3 },
		]);
	});

	test("CJK 按两列计宽折行", () => {
		expect(wrapComposer("中文字", 4)).toEqual([
			{ text: "中文", start: 0 },
			{ text: "字", start: 2 },
		]);
	});
});

describe("caretPosition", () => {
	test("行内位置换算为列宽", () => {
		expect(locate("hello", 3, 20)).toEqual({ row: 0, column: 3 });
	});

	test("CJK 之后的列数按两倍宽计算", () => {
		expect(locate("中文x", 2, 20)).toEqual({ row: 0, column: 4 });
	});

	test("换行之后的光标落在下一行行首", () => {
		expect(locate("ab\ncd", 3, 20)).toEqual({ row: 1, column: 0 });
	});

	test("折行边界上的光标显示在新行行首，而不是上一行行尾", () => {
		expect(locate("abcdef", 3, 3)).toEqual({ row: 1, column: 0 });
	});

	test("末尾光标停在最后一行的末尾", () => {
		expect(locate("ab\ncd", 5, 20)).toEqual({ row: 1, column: 2 });
	});
});
