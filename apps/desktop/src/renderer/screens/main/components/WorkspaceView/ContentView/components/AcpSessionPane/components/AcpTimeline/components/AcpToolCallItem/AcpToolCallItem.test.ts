import { describe, expect, test } from "bun:test";
import {
	classifyToolCallContent,
	formatRawToolCallContent,
	toolCallStatusText,
} from "./AcpToolCallItem";

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

	test("classifies Pi edit raw JSON details diff without echoing JSON", () => {
		const output = {
			content: [
				{
					type: "text",
					text: "Successfully replaced 4 block(s) in src/agent_fabric/infra/agent_runtime_tokens.py.",
				},
			],
			details: {
				diff: "@@\n- old\n+ new",
			},
		};
		const rawOutput = JSON.stringify(output);

		const result = classifyToolCallContent(
			[{ type: "content", content: { type: "text", text: rawOutput } }],
			rawOutput,
			"Edit fallback.py",
		);

		expect(result).toHaveLength(2);
		expect(result[0]?.kind).toBe("content");
		const diff = result[1];
		expect(diff?.kind).toBe("diff");
		if (diff?.kind === "diff") {
			expect(diff.path).toBe("src/agent_fabric/infra/agent_runtime_tokens.py");
			expect(diff.newText).toBe("@@\n- old\n+ new");
		}
	});

	test("classifies nested MCP result content from raw output details", () => {
		const output = {
			details: {
				mcpResult: {
					content: [
						{ type: "text", text: "browser result" },
						{ type: "image", mimeType: "image/png", data: "aW1hZ2U=" },
					],
				},
			},
		};
		const rawOutput = JSON.stringify(output);

		const result = classifyToolCallContent(
			[{ type: "content", content: { type: "text", text: rawOutput } }],
			rawOutput,
		);

		expect(result).toEqual([
			{ kind: "content", content: { type: "text", text: "browser result" } },
			{
				kind: "content",
				content: { type: "image", mimeType: "image/png", data: "aW1hZ2U=" },
			},
		]);
	});

	test("classifies bash stdout and stderr raw JSON", () => {
		const output = { stdout: "42 passed", stderr: "warning" };
		const rawOutput = JSON.stringify(output);

		const result = classifyToolCallContent(
			[{ type: "content", content: { type: "text", text: rawOutput } }],
			rawOutput,
			"bash",
		);

		expect(result).toEqual([
			{
				kind: "content",
				content: { type: "text", text: "stdout\n42 passed\n\nstderr\nwarning" },
			},
		]);
	});

	test("classifies read-style raw JSON content strings", () => {
		const output = {
			content: "file contents",
			details: { path: "src/index.ts" },
		};
		const rawOutput = JSON.stringify(output);

		const result = classifyToolCallContent(
			[{ type: "content", content: { type: "text", text: rawOutput } }],
			rawOutput,
			"Read src/index.ts",
		);

		expect(result).toEqual([
			{ kind: "content", content: { type: "text", text: "file contents" } },
		]);
	});
});

describe("formatRawToolCallContent", () => {
	test("does not silently truncate long raw tool output", () => {
		const output = "x".repeat(4_000);
		const formatted = formatRawToolCallContent({ output });

		expect(formatted).toContain(output);
	});
});
