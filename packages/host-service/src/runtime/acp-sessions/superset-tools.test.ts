import { describe, expect, mock, test } from "bun:test";
import type { SessionScopedState } from "@superset/session-protocol";
import type { AcpSessionManager } from "./acp-sessions";
import type {
	DelegationRunPersistence,
	DelegationRunRecord,
} from "./persistence";
import {
	type AcpSessionOpenRequest,
	SupersetToolController,
} from "./superset-tools";

function state(
	sessionId: string,
	workspaceId = "workspace-1",
): SessionScopedState {
	return {
		sessionId,
		epoch: "epoch-1",
		workspaceId,
		harness: "claude-agent-acp",
		status: "idle",
		title: null,
		currentMode: null,
		configOptions: [],
		availableCommands: null,
		pendingPermissions: [],
		queuedPrompts: [],
		cwd: `/tmp/${workspaceId}`,
		lastSeq: 0,
		lastStopReason: null,
		lastError: null,
		createdAt: 1,
		updatedAt: 1,
	};
}

function fixture() {
	const states = new Map([
		["source", state("source")],
		["sibling", state("sibling")],
		["foreign", state("foreign", "workspace-2")],
	]);
	const roles = new Map<string, string>([
		["source", "root-coordinator"],
		["sibling", "root-coordinator"],
		["foreign", "root-coordinator"],
	]);
	const prompt = mock(
		async (_input: { prompt: Array<{ type: "text"; text: string }> }) => ({
			accepted: true as const,
		}),
	);
	const enqueuePrompt = mock(() => ({ accepted: true as const }));
	const updatePlan = mock(() => ({
		seq: 21,
		epoch: "epoch-1",
		sessionId: "source",
		ts: 1,
		frame: {
			kind: "update" as const,
			update: {
				sessionUpdate: "plan" as const,
				entries: [
					{
						content: "Inspect the implementation",
						status: "in_progress" as const,
						priority: "medium" as const,
					},
				],
			},
		},
	}));
	const getMessages = mock((): unknown => ({
		items: [{ seq: 12, frame: { kind: "agent_message_chunk", text: "done" } }],
		nextCursor: "s8",
	}));
	const askUser = mock(async () => ({
		action: "answered" as const,
		answers: [
			{
				question: "Choose a runtime",
				selectedLabels: ["Bun"],
			},
		],
	}));
	const create = mock(
		async (input: {
			sessionId: string;
			workspaceId: string;
			harness?: SessionScopedState["harness"];
			model?: string;
			strictModel?: boolean;
			role?: "root-coordinator" | "delegated-executor";
		}) => {
			const created = {
				...state(input.sessionId, input.workspaceId),
				harness: input.harness ?? "claude-agent-acp",
			};
			states.set(input.sessionId, created);
			roles.set(input.sessionId, input.role ?? "root-coordinator");
			return created;
		},
	);
	const manager = {
		get: (sessionId: string) => {
			const found = states.get(sessionId);
			if (!found) throw new Error("not found");
			return found;
		},
		list: ({
			workspaceId,
			limit,
		}: {
			workspaceId?: string;
			limit?: number;
		}) => ({
			items: [...states.values()]
				.filter((item) => !workspaceId || item.workspaceId === workspaceId)
				.slice(0, limit),
			nextCursor: null,
			enabled: true,
		}),
		create,
		getRole: (sessionId: string) => roles.get(sessionId) ?? "root-coordinator",
		getMessages,
		prompt,
		ensureLive: mock(async () => {}),
		enqueuePrompt,
		updatePlan,
		askUser,
	} as unknown as AcpSessionManager;
	return {
		manager,
		create,
		getMessages,
		prompt,
		enqueuePrompt,
		updatePlan,
		askUser,
		roles,
	};
}

describe("SupersetToolController", () => {
	test("publishes a complete plan for the source session", async () => {
		const { manager, updatePlan } = fixture();
		const controller = new SupersetToolController({ manager });

		const result = await controller.execute({
			sourceSessionId: "source",
			name: "update_plan",
			arguments: {
				plan: [
					{ step: "Inspect the implementation", status: "in_progress" },
					{ step: "Add regression coverage", status: "pending" },
				],
				explanation: "Starting with the implementation review.",
			},
		});

		expect(updatePlan).toHaveBeenCalledWith({
			sessionId: "source",
			entries: [
				{ content: "Inspect the implementation", status: "in_progress" },
				{ content: "Add regression coverage", status: "pending" },
			],
			explanation: "Starting with the implementation review.",
		});
		expect(result).toEqual({ updated: true, sessionId: "source", seq: 21 });
	});

	test("rejects plans with more than one in-progress step", async () => {
		const { manager, updatePlan } = fixture();
		const controller = new SupersetToolController({ manager });

		await expect(
			controller.execute({
				sourceSessionId: "source",
				name: "update_plan",
				arguments: {
					plan: [
						{ step: "First", status: "in_progress" },
						{ step: "Second", status: "in_progress" },
					],
				},
			}),
		).rejects.toThrow("at most one in_progress");
		expect(updatePlan).not.toHaveBeenCalled();
	});

	test("rejects empty and oversized plan steps", async () => {
		const { manager, updatePlan } = fixture();
		const controller = new SupersetToolController({ manager });

		await expect(
			controller.execute({
				sourceSessionId: "source",
				name: "update_plan",
				arguments: { plan: [{ step: "   ", status: "pending" }] },
			}),
		).rejects.toThrow();
		await expect(
			controller.execute({
				sourceSessionId: "source",
				name: "update_plan",
				arguments: {
					plan: Array.from({ length: 51 }, (_, index) => ({
						step: `Step ${index + 1}`,
						status: "pending" as const,
					})),
				},
			}),
		).rejects.toThrow();
		expect(updatePlan).not.toHaveBeenCalled();
	});

	test("projects context and sessions only from the source workspace", async () => {
		const { manager } = fixture();
		const controller = new SupersetToolController({
			manager,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "claude",
				model: "sonnet",
			}),
		});

		const result = await controller.execute({
			sourceSessionId: "source",
			name: "get_context",
			arguments: {},
		});

		expect(result.workspaceId).toBe("workspace-1");
		expect(
			(result.sessions as Array<{ sessionId: string }>).map(
				(item) => item.sessionId,
			),
		).toEqual(["source", "sibling"]);
	});

	test("rejects cross-workspace session control", async () => {
		const { manager } = fixture();
		const controller = new SupersetToolController({
			manager,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "claude",
				model: "sonnet",
			}),
		});

		expect(
			controller.execute({
				sourceSessionId: "source",
				name: "send_message",
				arguments: { sessionId: "foreign", message: "hello" },
			}),
		).rejects.toThrow("unavailable in the current workspace");
	});

	test("opens a KDev merge request page derived from the source session only", async () => {
		const { manager } = fixture();
		const requests: Array<{
			workspaceId: string;
			sourceSessionId: string;
			provider: "kdev";
			url: string;
			sourceBranch: string;
			occurredAt: number;
		}> = [];
		const controller = new SupersetToolController({
			manager,
			openMergeRequest: async ({ cwd }) => {
				expect(cwd).toBe("/tmp/workspace-1");
				return {
					provider: "kdev" as const,
					url: "https://kdev.corp.kuaishou.com/git/group/repo/-/create_MR?branchName=feature%2Ftest",
					sourceBranch: "feature/test",
				};
			},
			onMergeRequestOpenRequested: (request) => requests.push(request),
		});

		const result = await controller.execute({
			sourceSessionId: "source",
			name: "open_merge_request",
			arguments: {},
		});

		expect(result).toEqual({
			provider: "kdev",
			sourceBranch: "feature/test",
			opened: true,
		});
		expect(requests).toMatchObject([
			{
				workspaceId: "workspace-1",
				sourceSessionId: "source",
				provider: "kdev",
				sourceBranch: "feature/test",
			},
		]);
	});

	test("rejects model-supplied merge-request paths, URLs, and branches", async () => {
		const { manager } = fixture();
		const controller = new SupersetToolController({
			manager,
			openMergeRequest: async () => {
				throw new Error("must not be called");
			},
		});

		await expect(
			controller.execute({
				sourceSessionId: "source",
				name: "open_merge_request",
				arguments: {
					cwd: "/tmp/other",
					url: "https://example.com",
					branch: "x",
					_noargs: "must not bypass strict validation",
				},
			}),
		).rejects.toThrow("Unrecognized keys");
	});

	test("reads a workspace session's persisted messages with cursor pagination", async () => {
		const { manager, getMessages } = fixture();
		const controller = new SupersetToolController({ manager });

		const result = await controller.execute({
			sourceSessionId: "source",
			name: "get_session_messages",
			arguments: { sessionId: "sibling", cursor: "s13", limit: 25 },
		});

		expect(getMessages).toHaveBeenCalledWith({
			sessionId: "sibling",
			beforeSeq: 13,
			limit: 25,
		});
		expect(result).toEqual({
			items: [
				{ seq: 12, frame: { kind: "agent_message_chunk", text: "done" } },
			],
			nextCursor: "s8",
		});
	});

	test("bounds and sanitizes model-facing history pages", async () => {
		const { manager, getMessages } = fixture();
		const controller = new SupersetToolController({ manager });
		const screenshot = "A".repeat(2 * 1024 * 1024);
		const nestedToolResult = JSON.stringify({
			items: [
				{
					seq: 7,
					frame: {
						kind: "update",
						update: {
							sessionUpdate: "agent_message_chunk",
							content: {
								type: "image",
								data: screenshot,
								mimeType: "image/png",
							},
						},
					},
				},
			],
			nextCursor: "s1",
		});
		getMessages.mockReturnValue({
			items: [
				{
					seq: 11,
					epoch: "epoch-1",
					sessionId: "sibling",
					ts: 1,
					frame: {
						kind: "update",
						update: {
							sessionUpdate: "tool_call_update",
							toolCallId: "screenshot-tool",
							title: "raw screenshot payload",
							status: "completed",
							rawOutput: screenshot,
						},
					},
				},
				{
					seq: 12,
					epoch: "epoch-1",
					sessionId: "sibling",
					ts: 1,
					frame: {
						kind: "update",
						update: {
							sessionUpdate: "agent_message_chunk",
							content: {
								type: "text",
								text: `Useful context before nested result: ${nestedToolResult}`,
							},
						},
					},
				},
			],
			nextCursor: "s8",
		});

		const result = await controller.execute({
			sourceSessionId: "source",
			name: "get_session_messages",
			arguments: { sessionId: "sibling", limit: 50 },
		});
		const serialized = JSON.stringify(result);

		expect(Buffer.byteLength(serialized)).toBeLessThanOrEqual(512 * 1024);
		expect(serialized).toContain("Useful context before nested result");
		expect(serialized).toContain("omitted");
		expect(serialized).not.toContain("A".repeat(1_024));
		expect(serialized).not.toContain("raw screenshot payload");
		expect(result).toMatchObject({ nextCursor: "s8" });
	});

	test("keeps the total model history page within budget and advances its cursor", async () => {
		const { manager, getMessages } = fixture();
		const controller = new SupersetToolController({ manager });
		getMessages.mockReturnValue({
			items: Array.from({ length: 40 }, (_, index) => ({
				seq: index + 1,
				epoch: "epoch-1",
				sessionId: "sibling",
				ts: index + 1,
				frame: {
					kind: "update",
					update: {
						sessionUpdate: "agent_message_chunk",
						content: {
							type: "text",
							text: `${index}: ${"word ".repeat(30_000)}`,
						},
					},
				},
			})),
			nextCursor: "s1",
		});

		const result = await controller.execute({
			sourceSessionId: "source",
			name: "get_session_messages",
			arguments: { sessionId: "sibling", limit: 50 },
		});
		const serialized = JSON.stringify(result);
		const items = result.items as unknown[];

		expect(Buffer.byteLength(serialized)).toBeLessThanOrEqual(512 * 1024);
		expect(items.length).toBeGreaterThan(0);
		expect(items.length).toBeLessThan(40);
		expect(result.nextCursor).toMatch(/^s[1-9][0-9]*$/);
		expect(result.nextCursor).not.toBe("s1");
	});

	test("rejects cross-workspace persisted message reads", async () => {
		const { manager, getMessages } = fixture();
		const controller = new SupersetToolController({ manager });

		await expect(
			controller.execute({
				sourceSessionId: "source",
				name: "get_session_messages",
				arguments: { sessionId: "foreign" },
			}),
		).rejects.toThrow("unavailable in the current workspace");
		expect(getMessages).not.toHaveBeenCalled();
	});

	test("creates, prompts, and requests opening a continuation session", async () => {
		const { manager, create, prompt } = fixture();
		const events: AcpSessionOpenRequest[] = [];
		const controller = new SupersetToolController({
			manager,
			onOpenRequested: (event) => events.push(event),
		});

		const result = await controller.execute({
			sourceSessionId: "source",
			name: "continue_in_new_session",
			arguments: {
				handoff: "Goal: finish the implementation",
				agent: "codex",
			},
		});

		expect(create).toHaveBeenCalledTimes(1);
		expect(create.mock.calls[0]?.[0]).toMatchObject({
			workspaceId: "workspace-1",
			harness: "codex-app-server",
		});
		expect(prompt).toHaveBeenCalledTimes(1);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			sessionId: result.sessionId,
			sourceSessionId: "source",
			reason: "context_limit",
		});

		await controller.execute({
			sourceSessionId: "source",
			name: "continue_in_new_session",
			arguments: { handoff: "Continue with the current tab" },
		});
		expect(create.mock.calls[1]?.[0]).toMatchObject({
			harness: "pi-acp",
		});
	});

	test("can start a continuation in another workspace", async () => {
		const { manager, create } = fixture();
		const events: AcpSessionOpenRequest[] = [];
		const controller = new SupersetToolController({
			manager,
			resolveTargetWorkspace: ({ workspaceId }) => {
				expect(workspaceId).toBe("workspace-2");
				return "workspace-2";
			},
			onOpenRequested: (event) => events.push(event),
		});

		const result = await controller.execute({
			sourceSessionId: "source",
			name: "continue_in_new_session",
			arguments: {
				handoff: "Start in the other project",
				workspaceId: "workspace-2",
			},
		});

		expect(create.mock.calls[0]?.[0]).toMatchObject({
			workspaceId: "workspace-2",
			harness: "pi-acp",
			role: "root-coordinator",
		});
		expect(result).toMatchObject({ workspaceId: "workspace-2" });
		expect(events[0]).toMatchObject({
			workspaceId: "workspace-2",
			sessionId: result.sessionId,
			sourceSessionId: "source",
		});
	});

	test("resolves project targets for continuations", async () => {
		const { manager, create } = fixture();
		const controller = new SupersetToolController({
			manager,
			resolveTargetWorkspace: ({ sourceWorkspaceId, projectPath }) => {
				expect(sourceWorkspaceId).toBe("workspace-1");
				expect(projectPath).toBe("/tmp/agent-fabric");
				return "workspace-2";
			},
		});

		await controller.execute({
			sourceSessionId: "source",
			name: "continue_in_new_session",
			arguments: {
				handoff: "Start in agent-fabric",
				projectPath: "/tmp/agent-fabric",
			},
		});

		expect(create.mock.calls[0]?.[0]).toMatchObject({
			workspaceId: "workspace-2",
			harness: "pi-acp",
		});
	});

	test("uses the global delegated executor instead of the source tab", async () => {
		const { manager, create } = fixture();
		manager.get("source").configOptions = [
			{
				id: "model",
				name: "Model",
				type: "select",
				category: "model",
				currentValue: "claude-sonnet-4-5",
				options: [],
			},
		];
		const controller = new SupersetToolController({
			manager,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "codex",
				model: "gpt-5.6-sol",
			}),
		});

		const delegated = await controller.execute({
			sourceSessionId: "source",
			name: "delegate",
			arguments: { task: "Implement the planned change" },
		});
		expect(create.mock.calls[0]?.[0]).toMatchObject({
			harness: "codex-app-server",
			model: "gpt-5.6-sol",
			strictModel: true,
			role: "delegated-executor",
		});
		expect(delegated).toMatchObject({
			actualAgent: "codex",
			actualModel: "gpt-5.6-sol",
		});

		await controller.execute({
			sourceSessionId: "source",
			name: "continue_in_new_session",
			arguments: { handoff: "Continue", agent: "claude" },
		});
		expect(create.mock.calls[1]?.[0]).toMatchObject({
			harness: "claude-agent-acp",
		});
		expect(create.mock.calls[1]?.[0]).not.toHaveProperty("model");
	});

	test("uses the global concrete model instead of the source tab default", async () => {
		const { manager, create } = fixture();
		manager.get("source").configOptions = [
			{
				id: "model",
				name: "Model",
				type: "select",
				category: "model",
				currentValue: "default",
				options: [],
			},
		];
		const controller = new SupersetToolController({
			manager,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "claude",
				model: "sonnet",
			}),
		});

		const delegated = await controller.execute({
			sourceSessionId: "source",
			name: "delegate",
			arguments: { task: "Use the current adapter default" },
		});

		expect(create.mock.calls[0]?.[0]).toMatchObject({
			harness: "claude-agent-acp",
			model: "sonnet",
			strictModel: true,
			role: "delegated-executor",
		});
		expect(delegated).toMatchObject({
			actualAgent: "claude",
			actualModel: "sonnet",
		});
	});

	test("routes a selected profile and includes its instructions in the child task", async () => {
		const { manager, create, prompt } = fixture();
		const controller = new SupersetToolController({
			manager,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "claude",
				model: "sonnet",
				profilesConfigured: true,
				profiles: [
					{
						id: "design",
						name: "Design",
						description: "Architecture first",
						instructions: "Start with a design and acceptance checks.",
						enabled: true,
						valid: true,
						order: 0,
						executorAgentConfigId: "codex-config",
						executorModelId: "gpt-5.6-sol",
						agent: "codex",
						model: "gpt-5.6-sol",
					},
				],
			}),
		});

		await controller.execute({
			sourceSessionId: "source",
			name: "delegate",
			arguments: {
				profileId: "design",
				task: "Implement the planned change",
			},
		});
		expect(create.mock.calls[0]?.[0]).toMatchObject({
			harness: "codex-app-server",
			model: "gpt-5.6-sol",
			strictModel: true,
		});
		expect(prompt.mock.calls[0]?.[0]?.prompt).toEqual([
			{
				type: "text",
				text: "Delegation profile: Design\n\nStart with a design and acceptance checks.\n\nDelegated task:\nImplement the planned change",
			},
		]);
	});

	test("requires profileId when persisted profiles are configured", async () => {
		const { manager, create } = fixture();
		const controller = new SupersetToolController({
			manager,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "claude",
				model: "sonnet",
				profilesConfigured: true,
				profiles: [
					{
						id: "disabled",
						name: "Disabled",
						description: "",
						instructions: null,
						enabled: false,
						valid: false,
						order: 0,
						executorAgentConfigId: null,
						executorModelId: null,
					},
					{
						id: "first-valid",
						name: "First valid",
						description: "",
						instructions: null,
						enabled: true,
						valid: true,
						order: 1,
						executorAgentConfigId: "pi-config",
						executorModelId: null,
						agent: "pi",
						model: null,
					},
				],
			}),
		});
		await expect(
			controller.execute({
				sourceSessionId: "source",
				name: "delegate",
				arguments: { task: "Use the default profile" },
			}),
		).rejects.toThrow("profileId is required");
		expect(create).not.toHaveBeenCalled();
		await controller.execute({
			sourceSessionId: "source",
			name: "delegate",
			arguments: { profileId: "first-valid", task: "Use the selected profile" },
		});
		expect(create.mock.calls[0]?.[0]).toMatchObject({ harness: "pi-acp" });
	});

	test("keeps implicit selection for generated unpersisted profiles", async () => {
		const { manager, create } = fixture();
		const controller = new SupersetToolController({
			manager,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "claude",
				model: "sonnet",
				profilesConfigured: false,
				profiles: [
					{
						id: "generated-default",
						name: "Generated default",
						description: "",
						instructions: null,
						enabled: true,
						valid: true,
						order: 0,
						executorAgentConfigId: "pi-config",
						executorModelId: null,
						agent: "pi",
						model: null,
					},
				],
			}),
		});

		await controller.execute({
			sourceSessionId: "source",
			name: "delegate",
			arguments: { task: "Use the generated default" },
		});

		expect(create.mock.calls[0]?.[0]).toMatchObject({ harness: "pi-acp" });
	});

	test("uses the global Pi target with its adapter default model", async () => {
		const { manager, create } = fixture();
		const controller = new SupersetToolController({
			manager,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "pi",
				model: null,
			}),
		});

		const delegated = await controller.execute({
			sourceSessionId: "source",
			name: "delegate",
			arguments: { task: "Use Pi's authenticated default" },
		});

		expect(create.mock.calls[0]?.[0]).toMatchObject({
			harness: "pi-acp",
		});
		expect(create.mock.calls[0]?.[0]).not.toHaveProperty("model");
		expect(create.mock.calls[0]?.[0]).not.toHaveProperty("strictModel");
		expect(delegated).toMatchObject({ actualAgent: "pi", actualModel: null });
	});

	test("persists a delegate handoff and its child lifecycle", async () => {
		const { manager, prompt } = fixture();
		const turn = Promise.resolve({ stopReason: "end_turn" });
		const sequence: string[] = [];
		prompt.mockImplementation(async () => {
			sequence.push("prompt");
			return { accepted: true as const, turn } as unknown as {
				accepted: true;
			};
		});
		const created: DelegationRunRecord[] = [];
		const updates: Array<
			{ id: string } & Parameters<
				DelegationRunPersistence["updateDelegationRun"]
			>[1]
		> = [];
		const delegationRuns: DelegationRunPersistence = {
			createDelegationRun: (record) => {
				sequence.push("run");
				created.push(record);
			},
			updateDelegationRun: (id, update) => updates.push({ id, ...update }),
			getDelegationRun: () => null,
			listDelegationRunsByParent: () => [],
			listActiveDelegationRuns: () => [],
		};
		const controller = new SupersetToolController({
			manager,
			delegationRuns,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "claude",
				model: "sonnet",
			}),
		});

		const result = await controller.execute({
			sourceSessionId: "source",
			name: "delegate",
			arguments: {
				task: "Implement the planned change",
				contextSnapshot: {
					summary: "Only inspect the delegation runtime",
					relevantFiles: ["packages/host-service/src/runtime/acp-sessions"],
					acceptanceChecks: ["Run the focused tests"],
				},
			},
		});

		expect(created).toHaveLength(1);
		expect(created[0]).toMatchObject({
			id: result.delegationRunId,
			parentSessionId: "source",
			parentWorkspaceId: "workspace-1",
			childSessionId: result.sessionId,
			childWorkspaceId: "workspace-1",
			handoff: "Implement the planned change",
			contextSnapshotJson: JSON.stringify({
				summary: "Only inspect the delegation runtime",
				relevantFiles: ["packages/host-service/src/runtime/acp-sessions"],
				acceptanceChecks: ["Run the focused tests"],
			}),
			actualAgent: "claude",
			actualModel: "sonnet",
			harness: "claude-agent-acp",
			status: "creating",
		});
		expect(sequence).toEqual(["run", "prompt"]);
		expect(prompt.mock.calls[0]?.[0]?.prompt[0]?.text).toContain(
			`delegationRunId '${result.delegationRunId}'`,
		);
		expect(prompt.mock.calls[0]?.[0]?.prompt[0]?.text).toContain(
			"Only inspect the delegation runtime",
		);
		expect(updates).toContainEqual(
			expect.objectContaining({
				id: result.delegationRunId,
				status: "running",
			}),
		);

		await Promise.resolve();
		expect(updates).toContainEqual(
			expect.objectContaining({
				id: result.delegationRunId,
				status: "completed",
			}),
		);
	});

	test("waits for delegated completion without polling and fans out to concurrent waiters", async () => {
		const { manager, prompt } = fixture();
		let resolveTurn!: (result: { stopReason: string }) => void;
		const turn = new Promise<{ stopReason: string }>((resolve) => {
			resolveTurn = resolve;
		});
		prompt.mockImplementation(
			async () =>
				({ accepted: true as const, turn }) as unknown as { accepted: true },
		);
		let persistedRun: DelegationRunRecord | null = null;
		const delegationRuns: DelegationRunPersistence = {
			createDelegationRun: (record) => {
				persistedRun = record;
			},
			updateDelegationRun: (id, update) => {
				if (persistedRun?.id !== id) return;
				persistedRun = { ...persistedRun, ...update };
			},
			getDelegationRun: (id) => (persistedRun?.id === id ? persistedRun : null),
			listDelegationRunsByParent: () => [],
			listActiveDelegationRuns: () => [],
		};
		const controller = new SupersetToolController({
			manager,
			delegationRuns,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "claude",
				model: "sonnet",
			}),
		});

		const delegated = await controller.execute({
			sourceSessionId: "source",
			name: "delegate",
			arguments: { task: "Wait for this child" },
		});
		const waitArguments = {
			sourceSessionId: "source",
			name: "wait_delegation" as const,
			arguments: { delegationRunId: delegated.delegationRunId as string },
		};
		const first = controller.execute(waitArguments);
		const second = controller.execute(waitArguments);
		const pending = await Promise.race([
			first.then(() => "resolved"),
			Bun.sleep(20).then(() => "pending"),
		]);
		expect(pending).toBe("pending");
		const reportedResult = {
			summary: "Completed the delegated work",
			validation: [{ command: "bun test", status: "passed" as const }],
		};
		await controller.execute({
			sourceSessionId: delegated.sessionId as string,
			name: "report_delegation_result",
			arguments: {
				delegationRunId: delegated.delegationRunId as string,
				result: reportedResult,
			},
		});

		resolveTurn({ stopReason: "end_turn" });
		expect(await Promise.all([first, second])).toEqual([
			expect.objectContaining({
				delegationRunId: delegated.delegationRunId,
				sessionId: delegated.sessionId,
				status: "completed",
				result: reportedResult,
			}),
			expect.objectContaining({
				delegationRunId: delegated.delegationRunId,
				sessionId: delegated.sessionId,
				status: "completed",
				result: reportedResult,
			}),
		]);
	});

	test("accepts a child result only for its owned active run and is idempotent", async () => {
		const { manager, roles } = fixture();
		roles.set("sibling", "delegated-executor");
		let persistedRun: DelegationRunRecord = {
			id: "run-report",
			parentSessionId: "source",
			parentWorkspaceId: "workspace-1",
			childSessionId: "sibling",
			childWorkspaceId: "workspace-1",
			handoff: "Report this task",
			profileId: "profile-1",
			contextSnapshotJson: '{"summary":"Relevant context"}',
			resultJson: null,
			actualAgent: "claude",
			actualModel: "sonnet",
			harness: "claude-agent-acp",
			status: "running",
			failureMessage: null,
			createdAt: 1,
			startedAt: 2,
			completedAt: null,
			failedAt: null,
			updatedAt: 2,
		};
		const updates: Array<
			Parameters<DelegationRunPersistence["updateDelegationRun"]>[1]
		> = [];
		const delegationRuns: DelegationRunPersistence = {
			createDelegationRun: () => {},
			updateDelegationRun: (_id, update) => {
				updates.push(update);
				persistedRun = { ...persistedRun, ...update };
			},
			getDelegationRun: (id) => (id === persistedRun.id ? persistedRun : null),
			listDelegationRunsByParent: () => [],
			listActiveDelegationRuns: () => [],
		};
		const controller = new SupersetToolController({ manager, delegationRuns });
		const result = {
			summary: "Implemented and validated the child task.",
			filesChanged: ["packages/example.ts"],
			validation: [{ command: "bun test", status: "passed" as const }],
			notes: ["No sibling context was used."],
		};

		await expect(
			controller.execute({
				sourceSessionId: "sibling",
				name: "report_delegation_result",
				arguments: { delegationRunId: "run-report", result },
			}),
		).resolves.toMatchObject({ accepted: true, result });
		expect(updates).toContainEqual(
			expect.objectContaining({ resultJson: JSON.stringify(result) }),
		);
		await expect(
			controller.execute({
				sourceSessionId: "sibling",
				name: "report_delegation_result",
				arguments: { delegationRunId: "run-report", result },
			}),
		).resolves.toMatchObject({ accepted: true, idempotent: true });
		await expect(
			controller.execute({
				sourceSessionId: "sibling",
				name: "report_delegation_result",
				arguments: {
					delegationRunId: "run-report",
					result: { summary: "A conflicting result" },
				},
			}),
		).rejects.toThrow("different result");
		await expect(
			controller.execute({
				sourceSessionId: "source",
				name: "report_delegation_result",
				arguments: { delegationRunId: "run-report", result },
			}),
		).rejects.toThrow("Only delegated executor");
		roles.set("foreign", "delegated-executor");
		await expect(
			controller.execute({
				sourceSessionId: "foreign",
				name: "report_delegation_result",
				arguments: { delegationRunId: "run-report", result },
			}),
		).rejects.toThrow("unavailable for this child session");
		persistedRun = {
			...persistedRun,
			status: "completed",
			completedAt: 3,
		};
		await expect(
			controller.execute({
				sourceSessionId: "source",
				name: "wait_delegation",
				arguments: { delegationRunId: "run-report" },
			}),
		).resolves.toMatchObject({ status: "completed", result });
		persistedRun = { ...persistedRun, resultJson: null };
		await expect(
			controller.execute({
				sourceSessionId: "sibling",
				name: "report_delegation_result",
				arguments: { delegationRunId: "run-report", result },
			}),
		).rejects.toThrow("already terminal");
	});

	test("returns persisted terminal runs immediately and honors cancellation", async () => {
		const { manager } = fixture();
		let persistedRun: DelegationRunRecord = {
			id: "run-terminal",
			parentSessionId: "source",
			parentWorkspaceId: "workspace-1",
			childSessionId: "sibling",
			childWorkspaceId: "workspace-1",
			handoff: "Already finished",
			profileId: null,
			contextSnapshotJson: null,
			resultJson: null,
			actualAgent: "claude",
			actualModel: "sonnet",
			harness: "claude-agent-acp",
			status: "completed",
			failureMessage: null,
			createdAt: 1,
			startedAt: 2,
			completedAt: 3,
			failedAt: null,
			updatedAt: 3,
		};
		const delegationRuns: DelegationRunPersistence = {
			createDelegationRun: () => {},
			updateDelegationRun: () => {},
			getDelegationRun: (id) => (persistedRun.id === id ? persistedRun : null),
			listDelegationRunsByParent: () => [],
			listActiveDelegationRuns: () => [],
		};
		const controller = new SupersetToolController({ manager, delegationRuns });
		await expect(
			controller.execute({
				sourceSessionId: "source",
				name: "wait_delegation",
				arguments: { delegationRunId: "run-terminal" },
			}),
		).resolves.toMatchObject({ status: "completed", completedAt: 3 });
		await expect(
			controller.execute({
				sourceSessionId: "sibling",
				name: "wait_delegation",
				arguments: { delegationRunId: "run-terminal" },
			}),
		).rejects.toThrow("Delegation run is unavailable in the current session");

		persistedRun = { ...persistedRun, status: "running", completedAt: null };
		const controllerWithActiveRun = new SupersetToolController({
			manager,
			delegationRuns,
		});
		const abortController = new AbortController();
		const wait = controllerWithActiveRun.execute(
			{
				sourceSessionId: "source",
				name: "wait_delegation",
				arguments: { delegationRunId: "run-terminal" },
			},
			abortController.signal,
		);
		abortController.abort();
		await expect(wait).rejects.toThrow("Superset tool call cancelled");
	});

	test.each([
		"cancelled",
		"interrupted",
	] as const)("preserves %s as the delegated run terminal status", async (stopReason) => {
		const { manager, prompt } = fixture();
		prompt.mockImplementation(
			async () =>
				({
					accepted: true as const,
					turn: Promise.resolve({ stopReason }),
				}) as unknown as { accepted: true },
		);
		const updates: Array<
			{ id: string } & Parameters<
				DelegationRunPersistence["updateDelegationRun"]
			>[1]
		> = [];
		const delegationRuns: DelegationRunPersistence = {
			createDelegationRun: () => {},
			updateDelegationRun: (id, update) => updates.push({ id, ...update }),
			getDelegationRun: () => null,
			listDelegationRunsByParent: () => [],
			listActiveDelegationRuns: () => [],
		};
		const controller = new SupersetToolController({
			manager,
			delegationRuns,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "claude",
				model: "sonnet",
			}),
		});

		const result = await controller.execute({
			sourceSessionId: "source",
			name: "delegate",
			arguments: { task: "Stop this child" },
		});
		await Promise.resolve();
		expect(updates).toContainEqual(
			expect.objectContaining({
				id: result.delegationRunId,
				status: stopReason,
				completedAt: null,
			}),
		);
		expect(updates).not.toContainEqual(
			expect.objectContaining({
				id: result.delegationRunId,
				status: "completed",
			}),
		);
	});

	test("marks a rejected child turn as failed", async () => {
		const { manager, prompt } = fixture();
		prompt.mockImplementation(
			async () =>
				({
					accepted: true as const,
					turn: Promise.reject(new Error("child transport failed")),
				}) as unknown as { accepted: true },
		);
		const updates: Array<
			{ id: string } & Parameters<
				DelegationRunPersistence["updateDelegationRun"]
			>[1]
		> = [];
		const delegationRuns: DelegationRunPersistence = {
			createDelegationRun: () => {},
			updateDelegationRun: (id, update) => updates.push({ id, ...update }),
			getDelegationRun: () => null,
			listDelegationRunsByParent: () => [],
			listActiveDelegationRuns: () => [],
		};
		const controller = new SupersetToolController({
			manager,
			delegationRuns,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "claude",
				model: "sonnet",
			}),
		});

		const result = await controller.execute({
			sourceSessionId: "source",
			name: "delegate",
			arguments: { task: "Fail this child" },
		});
		await Promise.resolve();
		expect(updates).toContainEqual(
			expect.objectContaining({
				id: result.delegationRunId,
				status: "failed",
				failureMessage: "child transport failed",
				completedAt: null,
			}),
		);
	});

	test("rejects recursive delegation from a delegated executor session", async () => {
		const { manager, roles } = fixture();
		roles.set("source", "delegated-executor");
		const controller = new SupersetToolController({
			manager,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "claude",
				model: "sonnet",
			}),
		});

		await expect(
			controller.execute({
				sourceSessionId: "source",
				name: "delegate",
				arguments: { task: "Do not recurse" },
			}),
		).rejects.toThrow("cannot delegate again");
	});

	test("reconciles an active persisted handoff when the controller restarts", () => {
		const { manager } = fixture();
		const child = manager.get("sibling");
		child.lastStopReason = "end_turn";
		child.lastCompletedAt = 42;
		const updates: Array<
			{ id: string } & Parameters<
				DelegationRunPersistence["updateDelegationRun"]
			>[1]
		> = [];
		const delegationRuns: DelegationRunPersistence = {
			createDelegationRun: () => {},
			updateDelegationRun: (id, update) => updates.push({ id, ...update }),
			getDelegationRun: () => null,
			listDelegationRunsByParent: () => [],
			listActiveDelegationRuns: () => [
				{
					id: "run-1",
					parentSessionId: "source",
					parentWorkspaceId: "workspace-1",
					childSessionId: "sibling",
					childWorkspaceId: "workspace-1",
					handoff: "Finish the task",
					profileId: null,
					contextSnapshotJson: null,
					resultJson: null,
					actualAgent: "codex",
					actualModel: null,
					harness: "claude-agent-acp",
					status: "running",
					failureMessage: null,
					createdAt: 1,
					startedAt: 2,
					completedAt: null,
					failedAt: null,
					updatedAt: 2,
				},
			],
		};

		new SupersetToolController({ manager, delegationRuns });

		expect(updates).toContainEqual(
			expect.objectContaining({
				id: "run-1",
				status: "completed",
				completedAt: 42,
			}),
		);
	});

	test("does not report an actual model when strict child creation fails", async () => {
		const { manager, create, prompt } = fixture();
		manager.get("source").configOptions = [
			{
				id: "model",
				name: "Model",
				type: "select",
				category: "model",
				currentValue: "claude-sonnet-4-5",
				options: [],
			},
		];
		create.mockImplementationOnce(async () => {
			throw new Error("adapter rejected required model");
		});
		const controller = new SupersetToolController({
			manager,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "claude",
				model: "claude-sonnet-4-5",
			}),
		});

		await expect(
			controller.execute({
				sourceSessionId: "source",
				name: "delegate",
				arguments: { task: "Implement the planned change" },
			}),
		).rejects.toThrow("adapter rejected required model");
		expect(prompt).not.toHaveBeenCalled();
	});

	test("reports delegated-execution state and rejects delegation when disabled", async () => {
		const { manager, create } = fixture();
		const controller = new SupersetToolController({
			manager,
			resolveDelegatedExecution: () => ({
				enabled: false,
			}),
		});

		const context = await controller.execute({
			sourceSessionId: "source",
			name: "get_context",
			arguments: {},
		});
		expect(context.delegatedExecution).toEqual({
			enabled: false,
		});
		await expect(
			controller.execute({
				sourceSessionId: "source",
				name: "delegate",
				arguments: { task: "Implement" },
			}),
		).rejects.toThrow("Delegated execution is disabled");
		expect(create).not.toHaveBeenCalled();
	});

	test("asks through the source session and returns the structured answer", async () => {
		const { manager, askUser } = fixture();
		const controller = new SupersetToolController({ manager });
		const questions = [
			{
				question: "Choose a runtime",
				header: "Runtime",
				options: [
					{ label: "Bun", description: "Use the repository default" },
					{ label: "Node" },
				],
			},
		];

		const result = await controller.execute({
			sourceSessionId: "source",
			name: "ask_user",
			arguments: { questions },
		});

		expect(askUser).toHaveBeenCalledWith({
			sessionId: "source",
			questions: [
				{ ...questions[0], multiSelect: false, allowCustomResponse: true },
			],
			signal: undefined,
		});
		expect(result).toEqual({
			action: "answered",
			answers: [{ question: "Choose a runtime", selectedLabels: ["Bun"] }],
		});
	});

	test("sets the run command for the project owning the source workspace", async () => {
		const { manager } = fixture();
		const setProjectRunCommand = mock(
			async (input: { workspaceId: string; commands: string[] }) => ({
				status: "configured" as const,
				commands: input.commands,
			}),
		);
		const controller = new SupersetToolController({
			manager,
			setProjectRunCommand,
		});

		const result = await controller.execute({
			sourceSessionId: "source",
			name: "set_project_run_command",
			arguments: { commands: ["  bun dev  "] },
		});

		expect(setProjectRunCommand).toHaveBeenCalledWith({
			workspaceId: "workspace-1",
			commands: ["bun dev"],
		});
		expect(result).toEqual({
			status: "configured",
			commands: ["bun dev"],
		});
	});

	test("rejects empty project run commands", async () => {
		const { manager } = fixture();
		const setProjectRunCommand = mock(async () => ({
			status: "configured" as const,
			commands: [],
		}));
		const controller = new SupersetToolController({
			manager,
			setProjectRunCommand,
		});

		await expect(
			controller.execute({
				sourceSessionId: "source",
				name: "set_project_run_command",
				arguments: { commands: ["   "] },
			}),
		).rejects.toThrow();
		expect(setProjectRunCommand).not.toHaveBeenCalled();
	});

	test("deduplicates child creation by source-scoped idempotency key", async () => {
		const { manager, create } = fixture();
		const controller = new SupersetToolController({
			manager,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "claude",
				model: "sonnet",
			}),
		});
		const request = {
			sourceSessionId: "source",
			name: "delegate" as const,
			arguments: {
				task: "Review the tests",
				idempotencyKey: "review-tests",
			},
		};

		const first = await controller.execute(request);
		const second = await controller.execute(request);

		expect(create).toHaveBeenCalledTimes(1);
		expect(second).toMatchObject({ sessionId: first.sessionId, reused: true });
	});

	test("retries prompt admission on the same child after partial success", async () => {
		const { manager, create, prompt } = fixture();
		prompt.mockImplementationOnce(async () => {
			throw new Error("temporary prompt failure");
		});
		const controller = new SupersetToolController({
			manager,
			resolveDelegatedExecution: () => ({
				enabled: true,
				valid: true,
				agent: "claude",
				model: "sonnet",
			}),
		});
		const request = {
			sourceSessionId: "source",
			name: "delegate" as const,
			arguments: {
				task: "Review the tests",
				idempotencyKey: "retry-prompt",
			},
		};

		await expect(controller.execute(request)).rejects.toThrow(
			"temporary prompt failure",
		);
		const retried = await controller.execute(request);

		expect(create).toHaveBeenCalledTimes(1);
		expect(prompt).toHaveBeenCalledTimes(2);
		expect(retried).toMatchObject({ reused: true });
	});
});
