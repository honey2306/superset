import { describe, expect, test } from "bun:test";
import {
	SUPERSET_TOOL_DEFINITIONS,
	supersetToolRequestSchema,
} from "./superset-tools";

describe("Superset delegation protocol", () => {
	test("accepts a finite context snapshot and structured child result", () => {
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "parent",
				name: "delegate",
				arguments: {
					task: "Inspect the isolated area",
					contextSnapshot: {
						summary: "Only the relevant facts",
						relevantFacts: ["Sibling tasks are independent"],
						relevantFiles: ["packages/session-protocol/src/superset-tools.ts"],
						constraints: ["Do not modify unrelated files"],
						acceptanceChecks: ["Run the focused test"],
					},
				},
			}),
		).toMatchObject({
			name: "delegate",
			arguments: { contextSnapshot: { summary: "Only the relevant facts" } },
		});
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "child",
				name: "report_delegation_result",
				arguments: {
					delegationRunId: "run-1",
					result: {
						summary: "Completed the isolated task",
						filesChanged: ["packages/example.ts"],
						validation: [{ command: "bun test", status: "passed" }],
					},
				},
			}),
		).toMatchObject({ name: "report_delegation_result" });
	});

	test("rejects oversized snapshots and malformed result validation", () => {
		expect(() =>
			supersetToolRequestSchema.parse({
				sourceSessionId: "parent",
				name: "delegate",
				arguments: {
					task: "Inspect",
					contextSnapshot: { summary: "x".repeat(33_000) },
				},
			}),
		).toThrow();
		expect(() =>
			supersetToolRequestSchema.parse({
				sourceSessionId: "parent",
				name: "delegate",
				arguments: {
					task: "Inspect",
					contextSnapshot: {
						relevantFacts: Array.from({ length: 20 }, () => "f".repeat(1_000)),
						relevantFiles: Array.from({ length: 20 }, () => "p".repeat(1_000)),
					},
				},
			}),
		).toThrow("serialized delegation payload");
		expect(() =>
			supersetToolRequestSchema.parse({
				sourceSessionId: "child",
				name: "report_delegation_result",
				arguments: {
					delegationRunId: "run-1",
					result: {
						summary: "Invalid validation status",
						validation: [{ command: "bun test", status: "unknown" }],
					},
				},
			}),
		).toThrow();
	});

	test("advertises report only as a distinct child-only tool", () => {
		const report = SUPERSET_TOOL_DEFINITIONS.find(
			(tool) => tool.name === "report_delegation_result",
		);
		expect(report?.description).toContain("Child-only");
		expect(report?.inputSchema).toMatchObject({
			required: ["delegationRunId", "result"],
		});
	});
});
