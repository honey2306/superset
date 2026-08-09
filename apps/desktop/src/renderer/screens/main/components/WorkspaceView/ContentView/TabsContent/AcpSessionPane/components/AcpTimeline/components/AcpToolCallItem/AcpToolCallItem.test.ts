import { describe, expect, test } from "bun:test";
import {
	classifyToolCallContent,
	formatRawToolCallContent,
	toolCallStatusText,
	toolCallTitle,
} from "./AcpToolCallItem";

describe("toolCallTitle", () => {
	test("uses a completed command in place of mfcli's generic Bash title", () => {
		expect(
			toolCallTitle({
				toolCallId: "bash-1",
				title: "Bash",
				rawInput: { command: "bun run test" },
			}),
		).toBe("bun run test");
	});

	test("preserves a meaningful adapter title when command input is present", () => {
		expect(
			toolCallTitle({
				toolCallId: "bash-1",
				title: "Run focused renderer tests",
				rawInput: { command: "bun run test AcpTimeline" },
			}),
		).toBe("Run focused renderer tests");
	});
});

describe("toolCallStatusText", () => {
	test("shows a blocked tool as awaiting approval rather than running", () => {
		expect(
			toolCallStatusText({ toolCallId: "bash-1", status: "in_progress" }, true),
		).toBe("awaiting approval");
	});

	test("preserves terminal tool statuses", () => {
		expect(
			toolCallStatusText({ toolCallId: "bash-1", status: "completed" }, false),
		).toBe("completed");
	});
});

describe("classifyToolCallContent", () => {
	test("returns empty for undefined content", () => {
		expect(classifyToolCallContent(undefined)).toEqual([]);
	});

	test("returns empty for empty array", () => {
		expect(classifyToolCallContent([])).toEqual([]);
	});

	test("classifies content type", () => {
		const input = [
			{ type: "content", content: { type: "text", text: "hello" } },
		];
		const result = classifyToolCallContent(input as never);
		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe("content");
	});

	test("classifies diff type with path", () => {
		const input = [{ type: "diff", path: "/src/foo.ts", newText: "bar" }];
		const result = classifyToolCallContent(input as never);
		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe("diff");
		const diff = result[0];
		if (diff?.kind === "diff") {
			expect(diff.path).toBe("/src/foo.ts");
		}
	});

	test("classifies terminal type with terminalId", () => {
		const input = [{ type: "terminal", terminalId: "term-1" }];
		const result = classifyToolCallContent(input as never);
		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe("terminal");
		const term = result[0];
		if (term?.kind === "terminal") {
			expect(term.terminalId).toBe("term-1");
		}
	});

	test("classifies mixed content array", () => {
		const input = [
			{ type: "content", content: { type: "text", text: "hello" } },
			{ type: "diff", path: "/src/foo.ts", newText: "bar" },
			{ type: "terminal", terminalId: "term-1" },
		];
		const result = classifyToolCallContent(input as never);
		expect(result).toHaveLength(3);
		expect(result[0]?.kind).toBe("content");
		expect(result[1]?.kind).toBe("diff");
		expect(result[2]?.kind).toBe("terminal");
	});
});

describe("formatRawToolCallContent", () => {
	test("does not silently truncate long raw tool output", () => {
		const output = "x".repeat(4_000);
		const formatted = formatRawToolCallContent({ output });

		expect(formatted).toContain(output);
	});
});
