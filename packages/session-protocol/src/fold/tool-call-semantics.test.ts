import { describe, expect, test } from "bun:test";
import type { ToolCall } from "../acp";
import { canonicalizeToolCall } from "./canonical-tool-call";
import { canonicalizeToolCallSemantics } from "./tool-call-semantics";

function call(overrides: Partial<ToolCall> = {}) {
	return canonicalizeToolCall({
		toolCallId: "tool-1",
		title: "Ordinary tool",
		...overrides,
	});
}

describe("canonical tool-call semantics", () => {
	test("keeps an ordinary tool adapter-agnostic", () => {
		expect(canonicalizeToolCallSemantics(call(), [])).toEqual({ kind: "tool" });
	});

	test.each([
		[
			"Claude",
			call({
				title: "Inspect repository",
				_meta: { claudeCode: { toolName: "Task" } },
			}),
		],
		[
			"Pi",
			call({
				title: "subagent",
				rawInput: { task: "Inspect repository", agent: "scout" },
			}),
		],
		[
			"Codex",
			call({
				title: "spawn_agent",
				rawInput: { prompt: "Inspect repository", agent_type: "explorer" },
			}),
		],
		[
			"MyFlicker",
			call({
				title: "Task",
				rawInput: { description: "Inspect repository", subagentType: "worker" },
			}),
		],
	])("normalizes %s delegation to the same discriminated shape", (_adapter, toolCall) => {
		expect(canonicalizeToolCallSemantics(toolCall, [])).toMatchObject({
			kind: "subagent",
			task: "Inspect repository",
		});
	});

	test("uses the reserved semantic contract without relying on a display title", () => {
		const semantics = canonicalizeToolCallSemantics(
			call({
				title: "Do some work",
				_meta: {
					"sh.superset/toolSemantic": {
						kind: "subagent",
						task: "Canonical task",
						agentType: "reviewer",
					},
				},
			}),
			[],
		);
		expect(semantics).toMatchObject({
			kind: "subagent",
			task: "Canonical task",
			agentType: "reviewer",
		});
	});

	test("normalizes nested activity even when the parent title is descriptive", () => {
		expect(
			canonicalizeToolCallSemantics(call({ title: "Inspect repository" }), [
				{ kind: "message" },
			]),
		).toMatchObject({ kind: "subagent", task: "Inspect repository" });
	});

	test("extracts the primary workflow result instead of exposing its envelope", () => {
		const semantics = canonicalizeToolCallSemantics(
			call({
				title: "subagent",
				content: [
					{
						type: "content",
						content: {
							type: "text",
							text: 'Workflow completed. Return: {"key":"review","output":"Readable finding","artifactPaths":["/private/session.jsonl"]}',
						},
					},
				],
			}),
			[],
		);
		expect(semantics).toMatchObject({
			kind: "subagent",
			result: [{ content: [{ type: "text", text: "Readable finding" }] }],
		});
	});
});
