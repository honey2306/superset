import { describe, expect, mock, test } from "bun:test";
import type { SessionScopedState } from "@superset/session-protocol";
import type { AcpSessionManager } from "./acp-sessions";
import { DiscussionCoordinator } from "./discussion-coordinator";

function state(sessionId: string): SessionScopedState {
	return {
		sessionId,
		epoch: "epoch-1",
		workspaceId: "workspace-1",
		harness: "pi-acp",
		status: "idle",
		title: null,
		currentMode: null,
		configOptions: [],
		availableCommands: null,
		pendingPermissions: [],
		queuedPrompts: [],
		cwd: "/tmp/workspace-1",
		lastSeq: 0,
		lastStopReason: null,
		lastError: null,
		createdAt: 1,
		updatedAt: 1,
	};
}

describe("DiscussionCoordinator", () => {
	test("runs peer turns in parallel and exchanges the previous round", async () => {
		const responses = new Map<string, string[]>();
		const prompt = mock((input: { sessionId: string; prompt: unknown[] }) => {
			const current = responses.get(input.sessionId) ?? [];
			current.push(`${input.sessionId} response ${current.length + 1}`);
			responses.set(input.sessionId, current);
			return {
				accepted: true as const,
				turn: Promise.resolve({ stopReason: "end_turn" as const }),
			};
		});
		const close = mock(async () => {});
		const manager = {
			prompt,
			close,
			getTranscript: ({ sessionId }: { sessionId: string }) => ({
				turns: [
					{
						assistantMessage: [
							{
								type: "text",
								text: responses.get(sessionId)?.at(-1) ?? "",
							},
						],
						items: [],
					},
				],
				index: [],
				totalTurns: 1,
				nextCursor: null,
			}),
		} as unknown as AcpSessionManager;
		const changed = mock(() => {});
		const coordinator = new DiscussionCoordinator({
			manager,
			onChanged: changed,
		});

		const run = await coordinator.start({
			id: "discussion-1",
			workspaceId: "workspace-1",
			sourceSessionId: "source",
			topic: "How should peer discussion work?",
			participants: [
				{
					sessionId: "alpha",
					agent: "claude",
					label: "Claude",
					harness: "claude-agent-acp",
				},
				{
					sessionId: "beta",
					agent: "codex",
					label: "Codex",
					harness: "codex-app-server",
				},
			],
			maxRounds: 2,
		});

		expect(run.status).toBe("completed");
		expect(run.rounds).toHaveLength(2);
		expect(prompt).toHaveBeenCalledTimes(4);
		const secondRound = prompt.mock.calls.slice(2);
		expect(JSON.stringify(secondRound[0])).toContain("beta response 1");
		expect(JSON.stringify(secondRound[1])).toContain("alpha response 1");
		expect(run.finalPositions).toEqual(run.rounds[1]?.contributions ?? []);
		expect(coordinator.list("workspace-1")).toHaveLength(1);
		expect(close).toHaveBeenCalledTimes(2);
		expect(changed).toHaveBeenCalled();
	});

	test("cancels both peer sessions", async () => {
		let release: (() => void) | undefined;
		const turn = new Promise<{ stopReason: "cancelled" }>((resolve) => {
			release = () => resolve({ stopReason: "cancelled" });
		});
		const cancel = mock(async () => release?.());
		const manager = {
			prompt: () => ({ accepted: true as const, turn }),
			cancel,
			close: mock(async () => {}),
			getTranscript: () => ({
				turns: [],
				index: [],
				totalTurns: 0,
				nextCursor: null,
			}),
		} as unknown as AcpSessionManager;
		const coordinator = new DiscussionCoordinator({ manager });
		const running = coordinator.start({
			id: "discussion-2",
			workspaceId: "workspace-1",
			sourceSessionId: "source",
			topic: "Stop this discussion",
			participants: [
				{
					sessionId: "alpha",
					agent: "claude",
					label: "Claude",
					harness: "claude-agent-acp",
				},
				{
					sessionId: "beta",
					agent: "codex",
					label: "Codex",
					harness: "codex-app-server",
				},
			],
			maxRounds: 2,
		});

		const stopped = await coordinator.stop("discussion-2");
		expect(stopped.status).toBe("cancelled");
		expect(cancel).toHaveBeenCalledTimes(2);
		expect((await running).status).toBe("cancelled");
	});

	test("marks a persisted active discussion interrupted on restart", () => {
		const persisted = {
			id: "discussion-restored",
			workspaceId: "workspace-1",
			sourceSessionId: "source",
			topic: "Recovered topic",
			status: "running" as const,
			currentRound: 1,
			maxRounds: 2,
			participants: [],
			rounds: [],
			finalPositions: [],
			failureMessage: null,
			createdAt: 1,
			updatedAt: 1,
			completedAt: null,
		};
		const persistedWrites: unknown[] = [];
		const upsertDiscussionRun = mock((run: unknown) => {
			persistedWrites.push(run);
		});
		const persistence = {
			listActiveDiscussionRuns: () => [persisted],
			listDiscussionRuns: () => [],
			getDiscussionRun: () => null,
			upsertDiscussionRun,
		};
		const coordinator = new DiscussionCoordinator({
			manager: {} as AcpSessionManager,
			persistence,
		});

		expect(upsertDiscussionRun).toHaveBeenCalledTimes(1);
		expect(persistedWrites[0]).toMatchObject({
			id: "discussion-restored",
			status: "failed",
		});
		expect(coordinator.get("discussion-restored")).toMatchObject({
			status: "failed",
		});
	});

	test("does not expose participant sessions through ordinary listing", () => {
		expect(state("participant").status).toBe("idle");
	});
});
