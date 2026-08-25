import { describe, expect, test } from "bun:test";
import {
	SUPERSET_TOOL_DEFINITIONS,
	supersetToolRequestSchema,
} from "./superset-tools";

describe("Superset delegation protocol", () => {
	test("accepts target workspace for new sessions", () => {
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "parent",
				name: "continue_in_new_session",
				arguments: {
					handoff: "Start this in another project",
					workspaceId: "workspace-2",
				},
			}),
		).toMatchObject({
			name: "continue_in_new_session",
			arguments: { workspaceId: "workspace-2" },
		});
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "parent",
				name: "delegate",
				arguments: {
					task: "Run the isolated check",
					projectPath: "/Users/me/Code/agent-fabric",
				},
			}),
		).toMatchObject({
			name: "delegate",
			arguments: { projectPath: "/Users/me/Code/agent-fabric" },
		});
	});

	test("accepts an existing-session open request and advertises it", () => {
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "parent",
				name: "open_session",
				arguments: { sessionId: "sibling" },
			}),
		).toEqual({
			sourceSessionId: "parent",
			name: "open_session",
			arguments: { sessionId: "sibling" },
		});
		const tool = SUPERSET_TOOL_DEFINITIONS.find(
			(entry) => entry.name === "open_session",
		);
		expect(tool).toMatchObject({
			name: "open_session",
			inputSchema: {
				required: ["sessionId"],
				properties: { sessionId: { type: "string" } },
			},
		});
	});

	test("rejects an open request without a session id or with extra fields", () => {
		expect(() =>
			supersetToolRequestSchema.parse({
				sourceSessionId: "parent",
				name: "open_session",
				arguments: {},
			}),
		).toThrow();
		expect(() =>
			supersetToolRequestSchema.parse({
				sourceSessionId: "parent",
				name: "open_session",
				arguments: { sessionId: "sibling", workspaceId: "workspace-2" },
			}),
		).toThrow();
	});

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
