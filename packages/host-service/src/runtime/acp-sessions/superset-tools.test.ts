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
	const prompt = mock(async () => ({ accepted: true as const }));
	const enqueuePrompt = mock(() => ({ accepted: true as const }));
	const getMessages = mock(() => ({
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
		}) => {
			const created = {
				...state(input.sessionId, input.workspaceId),
				harness: input.harness ?? "claude-agent-acp",
			};
			states.set(input.sessionId, created);
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
		getMessages,
		prompt,
		ensureLive: mock(async () => {}),
		enqueuePrompt,
		askUser,
	} as unknown as AcpSessionManager;
	return { manager, create, getMessages, prompt, enqueuePrompt, askUser };
}

describe("SupersetToolController", () => {
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
			harness: "claude-agent-acp",
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
		});
		expect(delegated).toMatchObject({
			actualAgent: "claude",
			actualModel: "sonnet",
		});
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
		prompt.mockImplementation(
			async () =>
				({ accepted: true as const, turn }) as unknown as { accepted: true },
		);
		const created: DelegationRunRecord[] = [];
		const updates: Array<
			{ id: string } & Parameters<
				DelegationRunPersistence["updateDelegationRun"]
			>[1]
		> = [];
		const delegationRuns: DelegationRunPersistence = {
			createDelegationRun: (record) => created.push(record),
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
			arguments: { task: "Implement the planned change" },
		});

		expect(created).toHaveLength(1);
		expect(created[0]).toMatchObject({
			id: result.delegationRunId,
			parentSessionId: "source",
			parentWorkspaceId: "workspace-1",
			childSessionId: result.sessionId,
			childWorkspaceId: "workspace-1",
			handoff: "Implement the planned change",
			actualAgent: "claude",
			actualModel: "sonnet",
			harness: "claude-agent-acp",
			status: "creating",
		});
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
