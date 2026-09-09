/**
 * Turn-end lifecycle coverage against the deterministic ACP adapter. The
 * callback is used by the desktop host to release resources opened by a turn.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AcpSessionManager } from "../../src/runtime/acp-sessions";

const FAKE_ADAPTER = path.join(
	import.meta.dir,
	"../fixtures/fake-acp-adapter.ts",
);
const WORKSPACE_ID = "acp-turn-end-workspace";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
	predicate: () => boolean,
	timeoutMs: number,
	label: string,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) {
			throw new Error(`timed out waiting for ${label}`);
		}
		await sleep(10);
	}
}

describe("ACP turn-end hook", () => {
	const workspaceDir = mkdtempSync(path.join(os.tmpdir(), "acp-turn-end-"));
	const managers: AcpSessionManager[] = [];

	afterEach(async () => {
		await Promise.all(managers.splice(0).map((manager) => manager.dispose()));
	});

	function newManager(onTurnEnd: (sessionId: string) => Promise<void>) {
		const manager = new AcpSessionManager({
			resolveWorkspaceCwd: () => workspaceDir,
			adapterEntry: FAKE_ADAPTER,
			onTurnEnd,
		});
		managers.push(manager);
		return manager;
	}

	async function createSession(manager: AcpSessionManager, sessionId: string) {
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });
	}

	async function waitForHangReady(
		manager: AcpSessionManager,
		sessionId: string,
	): Promise<void> {
		await waitFor(
			() =>
				manager
					.getMessages({ sessionId, limit: 200 })
					.items.some(
						(envelope) =>
							envelope.frame.kind === "update" &&
							envelope.frame.update.sessionUpdate === "tool_call",
					),
			5_000,
			"hang tool call",
		);
	}

	test("runs after a successful turn", async () => {
		const calls: string[] = [];
		const manager = newManager(async (sessionId) => {
			calls.push(sessionId);
		});
		const sessionId = "turn-end-success";
		await createSession(manager, sessionId);

		await manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "say done" }],
		}).turn;

		expect(calls).toEqual([sessionId]);
	});

	test("runs after a rejected turn without masking its rejection", async () => {
		const calls: string[] = [];
		const manager = newManager(async (sessionId) => {
			calls.push(sessionId);
		});
		const sessionId = "turn-end-failure";
		await createSession(manager, sessionId);

		await expect(
			manager.prompt({
				sessionId,
				prompt: [{ type: "text", text: "reject expected failure" }],
			}).turn,
		).rejects.toThrow();
		expect(calls).toEqual([sessionId]);
	});

	test("runs after cancellation", async () => {
		const calls: string[] = [];
		const manager = newManager(async (sessionId) => {
			calls.push(sessionId);
		});
		const sessionId = "turn-end-cancel";
		await createSession(manager, sessionId);

		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "hang" }],
		});
		await waitForHangReady(manager, sessionId);
		await manager.cancel({ sessionId });
		expect((await turn).stopReason).toBe("cancelled");
		expect(calls).toEqual([sessionId]);
	});

	test("waits for cleanup before draining queued prompts", async () => {
		let releaseCleanup: (() => void) | undefined;
		let cleanupStarted = false;
		let cleanupCalls = 0;
		const manager = newManager(() => {
			cleanupCalls += 1;
			if (cleanupCalls > 1) return Promise.resolve();
			return new Promise<void>((resolve) => {
				cleanupStarted = true;
				releaseCleanup = resolve;
			});
		});
		const sessionId = "turn-end-queue";
		await createSession(manager, sessionId);

		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "hang" }],
		});
		await waitForHangReady(manager, sessionId);
		manager.enqueuePrompt({
			sessionId,
			prompt: [{ type: "text", text: "say queued" }],
		});
		await manager.cancel({ sessionId });
		await waitFor(() => cleanupStarted, 5_000, "cleanup to start");

		expect(manager.get(sessionId).queuedPrompts).toHaveLength(1);
		releaseCleanup?.();
		await turn;
		await waitFor(
			() =>
				manager.get(sessionId).status === "idle" &&
				manager.get(sessionId).queuedPrompts.length === 0,
			5_000,
			"queued prompt to drain",
		);
	});

	test("waits for cleanup before sending a directly submitted prompt", async () => {
		let releaseCleanup: (() => void) | undefined;
		let cleanupCalls = 0;
		const manager = newManager(() => {
			cleanupCalls += 1;
			if (cleanupCalls > 1) return Promise.resolve();
			return new Promise<void>((resolve) => {
				releaseCleanup = resolve;
			});
		});
		const sessionId = "turn-end-direct-prompt";
		await createSession(manager, sessionId);

		const first = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "say first" }],
		});
		await waitFor(() => cleanupCalls === 1, 5_000, "first cleanup to start");

		const second = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "say second" }],
		});
		let secondSettled = false;
		void second.turn.then(() => {
			secondSettled = true;
		});
		await sleep(50);

		// A direct prompt may be accepted while cleanup is in progress, but its
		// adapter request must wait for the resource-release callback.
		expect(secondSettled).toBeFalse();
		expect(cleanupCalls).toBe(1);

		releaseCleanup?.();
		await first.turn;
		await second.turn;
		expect(cleanupCalls).toBe(2);
	});

	test("a cleanup failure does not block the queue", async () => {
		let calls = 0;
		const manager = newManager(async () => {
			calls += 1;
			if (calls === 1) throw new Error("cleanup failed");
		});
		const sessionId = "turn-end-cleanup-failure";
		await createSession(manager, sessionId);

		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "hang" }],
		});
		await waitForHangReady(manager, sessionId);
		manager.enqueuePrompt({
			sessionId,
			prompt: [{ type: "text", text: "say queued" }],
		});
		await manager.cancel({ sessionId });
		await turn;
		await waitFor(
			() =>
				calls === 2 &&
				manager.get(sessionId).status === "idle" &&
				manager.get(sessionId).queuedPrompts.length === 0,
			5_000,
			"queue after cleanup failure",
		);
	});
});
