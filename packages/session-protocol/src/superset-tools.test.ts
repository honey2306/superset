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

	test("exposes a Tokenverse-compatible global MCP upsert schema", () => {
		const tool = SUPERSET_TOOL_DEFINITIONS.find(
			(entry) => entry.name === "upsert_global_mcp_server",
		);
		expect(tool?.inputSchema).toMatchObject({
			type: "object",
			required: ["name"],
			properties: {
				type: { enum: ["stdio", "http", "sse"] },
				name: { type: "string" },
				command: { type: "string" },
				url: { type: "string" },
			},
		});
		for (const combinator of ["oneOf", "anyOf", "allOf"]) {
			expect(tool?.inputSchema).not.toHaveProperty(combinator);
		}
	});

	test("validates global MCP upserts by transport type", () => {
		const parse = (arguments_: Record<string, unknown>) =>
			supersetToolRequestSchema.safeParse({
				sourceSessionId: "session-1",
				name: "upsert_global_mcp_server",
				arguments: arguments_,
			});

		expect(parse({ name: "stdio", command: "npx" }).success).toBe(true);
		expect(
			parse({ type: "http", name: "http", url: "https://mcp.example.com" })
				.success,
		).toBe(true);
		expect(
			parse({ type: "sse", name: "sse", url: "https://mcp.example.com/sse" })
				.success,
		).toBe(true);
		expect(parse({ name: "missing-command" }).success).toBe(false);
		expect(parse({ type: "http", name: "missing-url" }).success).toBe(false);
		expect(parse({ type: "sse", name: "missing-url" }).success).toBe(false);
		expect(
			parse({
				name: "mixed-stdio",
				command: "npx",
				url: "https://mcp.example.com",
			}).success,
		).toBe(false);
		expect(
			parse({
				type: "http",
				name: "mixed-http",
				url: "https://mcp.example.com",
				command: "npx",
			}).success,
		).toBe(false);
	});

	test("permits explicit cross-project reads without widening memory writes", () => {
		const request = (name: string, args: Record<string, unknown>) =>
			supersetToolRequestSchema.safeParse({
				sourceSessionId: "session-1",
				name,
				arguments: args,
			});
		expect(request("list_memory_projects", {}).success).toBe(true);
		expect(
			request("search_project_memories", { scope: "accessible" }).success,
		).toBe(true);
		expect(
			request("search_project_memories", {
				scope: "project",
				projectId: "other",
			}).success,
		).toBe(true);
		for (const scope of ["global", "all", "accessible"]) {
			expect(
				request("search_project_memories", { scope, projectId: "other" })
					.success,
			).toBe(false);
		}
		for (const name of [
			"remember_project_memory",
			"update_project_memory",
			"delete_project_memory",
		]) {
			const args =
				name === "remember_project_memory"
					? { title: "Test", content: "Test" }
					: {
							memoryId: "m1",
							...(name === "update_project_memory" ? { content: "Test" } : {}),
						};
			expect(request(name, { ...args, projectId: "other" }).success).toBe(
				false,
			);
			expect(request(name, { ...args, scope: "external" }).success).toBe(false);
		}
		expect(formatProjectMemoryInstructions([])).toContain("read-only search");
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
		for (const tool of [remember, update, remove]) {
			expect(tool?.description).toContain("only when the user explicitly");
		}
		expect(remember?.description).toContain("Never save autonomously");
		expect(update?.description).toContain("Never update autonomously");
		expect(remove?.description).toContain("Never delete autonomously");
		expect(formatProjectMemoryInstructions([])).toContain(
			"Never save or maintain memories autonomously",
		);
		expect(formatProjectMemoryInstructions([])).toContain(
			"Reading and searching memories do not require an explicit user request",
		);
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

	test("accepts both turn cursors and legacy seq cursors for session history", () => {
		// 新版 t<turn> 游标与旧版 s<seq> 游标都必须能过校验：旧游标只存在于
		// 升级前代理的上下文里，拒收会让分页中断。
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "source",
				name: "get_session_messages",
				arguments: { sessionId: "sibling", cursor: "t24", limit: 50 },
			}),
		).toMatchObject({ arguments: { cursor: "t24" } });
		expect(
			supersetToolRequestSchema.parse({
				sourceSessionId: "source",
				name: "get_session_messages",
				arguments: { sessionId: "sibling", cursor: "s228" },
			}),
		).toMatchObject({ arguments: { cursor: "s228" } });
		expect(() =>
			supersetToolRequestSchema.parse({
				sourceSessionId: "source",
				name: "get_session_messages",
				arguments: { sessionId: "sibling", cursor: "x1" },
			}),
		).toThrow();

		const tool = SUPERSET_TOOL_DEFINITIONS.find(
			(entry) => entry.name === "get_session_messages",
		);
		expect(
			(tool?.inputSchema as { properties: { cursor?: { pattern?: string } } })
				.properties?.cursor?.pattern,
		).toBe("^(s[1-9][0-9]*|t[1-9][0-9]*)$");
	});
});
