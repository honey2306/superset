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
		const update = SUPERSET_TOOL_DEFINITIONS.find(
			(entry) => entry.name === "update_project_memory",
		);
		const remove = SUPERSET_TOOL_DEFINITIONS.find(
			(entry) => entry.name === "delete_project_memory",
		);
		expect(remember?.description).toContain("durable, verified knowledge");
		expect(search?.description).toContain("expensive investigation");
		expect(update?.description).toContain("memory by ID");
		expect(remove?.description).toContain("delete");
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
			arguments: {
				category: "debugging",
				pinned: false,
				scope: "project",
			},
		});
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "session-1",
				name: "search_project_memories",
				arguments: {},
			}),
		).toMatchObject({
			arguments: { query: "", limit: 10, scope: "all" },
		});
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "session-1",
				name: "update_project_memory",
				arguments: { memoryId: "memory-1", pinned: true },
			}),
		).toMatchObject({
			arguments: { memoryId: "memory-1", pinned: true, scope: "project" },
		});
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "session-1",
				name: "delete_project_memory",
				arguments: { memoryId: "memory-1", scope: "global" },
			}),
		).toMatchObject({
			arguments: { memoryId: "memory-1", scope: "global" },
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

		const terminalRequest = supersetToolRequestSchema.parse({
			sourceSessionId: "session-1",
			name: "read_terminal",
			arguments: { terminalId: "terminal-1" },
		});
		expect(terminalRequest).toMatchObject({
			arguments: { terminalId: "terminal-1", maxBytes: 16_384 },
		});
		const tools = SUPERSET_TOOL_DEFINITIONS.map(
			(definition) => definition.name,
		);
		expect(tools).toEqual(
			expect.arrayContaining([
				"create_terminal",
				"write_terminal",
				"read_terminal",
				"get_terminal_status",
				"close_terminal",
				"steer_session",
				"list_global_mcp_servers",
				"upsert_global_mcp_server",
				"remove_global_mcp_server",
				"list_global_skills",
				"upsert_global_skill",
				"remove_global_skill",
			]),
		);
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "session-1",
				name: "upsert_global_skill",
				arguments: {
					name: "review-pr",
					description: "Review pull requests",
					instructions: "Inspect the diff.",
				},
			}),
		).toMatchObject({ arguments: { name: "review-pr" } });
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "session-1",
				name: "upsert_global_mcp_server",
				arguments: { name: "docs", command: "npx" },
			}),
		).toMatchObject({
			arguments: { type: "stdio", args: [], env: {}, enabled: true },
		});
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "session-1",
				name: "upsert_global_mcp_server",
				arguments: {
					type: "http",
					name: "docs",
					url: "https://mcp.example.com",
					headers: { Authorization: "Bearer test" },
				},
			}),
		).toMatchObject({
			arguments: { type: "http", headers: { Authorization: "Bearer test" } },
		});
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "session-1",
				name: "steer_session",
				arguments: { sessionId: "session-2", message: "Check this first" },
			}),
		).toMatchObject({ name: "steer_session" });

		const scopedMemory = formatProjectMemoryInstructions([
			{ title: "Shared workflow", category: "workflow", scope: "global" },
			{ title: "Shared workflow", category: "workflow", scope: "project" },
			{ title: "Preferred language", category: "preference", scope: "global" },
		]);
		expect(scopedMemory).toContain(
			"Project memory index:\n- Shared workflow (workflow)",
		);
		expect(scopedMemory).toContain(
			"Global memory index:\n- Preferred language (preference)",
		);
		expect(scopedMemory.match(/Shared workflow/g)).toHaveLength(1);
		expect(scopedMemory).toContain("Project memory takes precedence");
	});

	test("advertises and validates peer discussions", () => {
		const tool = SUPERSET_TOOL_DEFINITIONS.find(
			(definition) => definition.name === "discuss",
		);
		expect(tool?.description).toContain("peer agents");
		expect(tool?.description).toContain("right sidebar");
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "session-1",
				name: "discuss",
				arguments: {
					topic: "Choose an ACP discussion model",
					participants: [{ agent: "claude" }, { agent: "codex" }],
				},
			}),
		).toMatchObject({ name: "discuss", arguments: { maxRounds: 2 } });
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
