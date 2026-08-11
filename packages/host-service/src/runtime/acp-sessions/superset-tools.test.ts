import { describe, expect, mock, test } from "bun:test";
import type { SessionScopedState } from "@superset/session-protocol";
import type { AcpSessionManager } from "./acp-sessions";
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
	const create = mock(
		async (input: {
			sessionId: string;
			workspaceId: string;
			harness?: SessionScopedState["harness"];
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
		prompt,
		ensureLive: mock(async () => {}),
		enqueuePrompt,
	} as unknown as AcpSessionManager;
	return { manager, create, prompt, enqueuePrompt };
}

describe("SupersetToolController", () => {
	test("projects context and sessions only from the source workspace", async () => {
		const { manager } = fixture();
		const controller = new SupersetToolController({ manager });

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
		const controller = new SupersetToolController({ manager });

		expect(
			controller.execute({
				sourceSessionId: "source",
				name: "send_message",
				arguments: { sessionId: "foreign", message: "hello" },
			}),
		).rejects.toThrow("unavailable in the current workspace");
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
	});

	test("deduplicates child creation by source-scoped idempotency key", async () => {
		const { manager, create } = fixture();
		const controller = new SupersetToolController({ manager });
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
		const controller = new SupersetToolController({ manager });
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
