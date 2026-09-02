import { describe, expect, test } from "bun:test";
import {
	composeSupersetModelFacingInstructions,
	formatProjectMemoryInstructions,
	SUPERSET_PLAN_INSTRUCTIONS,
	SUPERSET_TOOL_DEFINITIONS,
	supersetToolRequestSchema,
} from "./superset-tools";

describe("Superset delegation protocol", () => {
	test("composes model-facing plan and role instructions", () => {
		expect(
			composeSupersetModelFacingInstructions([
				SUPERSET_PLAN_INSTRUCTIONS,
				"  Role-specific guidance.  ",
			]),
		).toBe(`${SUPERSET_PLAN_INSTRUCTIONS}\n\nRole-specific guidance.`);
		expect(
			composeSupersetModelFacingInstructions([undefined, "  ", undefined]),
		).toBeUndefined();
	});

	test("advertises project memory recording and formats injected memory", () => {
		const remember = SUPERSET_TOOL_DEFINITIONS.find(
			(entry) => entry.name === "remember_project_memory",
		);
		const search = SUPERSET_TOOL_DEFINITIONS.find(
			(entry) => entry.name === "search_project_memories",
		);
		expect(remember?.description).toContain("durable, verified knowledge");
		expect(search?.description).toContain("expensive investigation");
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "session-1",
				name: "remember_project_memory",
				arguments: {
					title: "CDP workflow",
					content: "Match the renderer to the current worktree.",
					category: "debugging",
				},
			}),
		).toMatchObject({
			arguments: { category: "debugging", pinned: false },
		});
		const injectedMemory = formatProjectMemoryInstructions([
			{
				title: "CDP workflow",
				category: "debugging",
			},
		]);
		expect(injectedMemory).toContain(
			"Project memory index:\n- CDP workflow (debugging)",
		);
		expect(injectedMemory).not.toContain("Pinned");
		expect(injectedMemory).toContain(
			"call `search_project_memories` to retrieve full details",
		);
		expect(injectedMemory).not.toContain(
			"Match the renderer to the current worktree.",
		);
	});

	test("advertises timely user-visible plan updates", () => {
		const tool = SUPERSET_TOOL_DEFINITIONS.find(
			(entry) => entry.name === "update_plan",
		);
		expect(tool?.description).toContain(
			"before implementation or tool execution",
		);
		expect(tool?.description).toContain("when a step starts or completes");
		expect(tool?.description).toContain("before the final response");
		expect(tool?.description).toContain("simple tasks do not require a plan");
	});

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

	test("keeps continuation separate from delegation in its model contract", () => {
		const continuation = SUPERSET_TOOL_DEFINITIONS.find(
			(tool) => tool.name === "continue_in_new_session",
		);
		const reason = (
			continuation?.inputSchema as {
				properties?: { reason?: { enum?: string[] } };
			}
		).properties?.reason;

		expect(reason?.enum).toEqual(["context_limit", "fresh_start"]);
		expect(continuation?.description).toContain(
			"only for handing off continuation context or opening a new conversation",
		);
		expect(continuation?.description).toContain(
			"do not use it to delegate independent work or run parallel background tasks",
		);
		expect(continuation?.description).toContain("provider-native subagent");
		expect(continuation?.description).toContain("Superset `delegate`");
	});

	test("keeps parsing the historical parallel-task reason at runtime", () => {
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "parent",
				name: "continue_in_new_session",
				arguments: {
					reason: "parallel_task",
					handoff: "Continue the existing work",
				},
			}),
		).toMatchObject({
			name: "continue_in_new_session",
			arguments: { reason: "parallel_task" },
		});
	});
});
