import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { taskContractSchema } from "@superset/shared/tasks";
import { taskChecks } from "../db/schema";
import { resolveTaskStrategy, taskPrompt } from "./task-policy";
import { TaskStore } from "./task-store";
import { eventually, taskFixture } from "./test-fixture";

type Fixture = Awaited<ReturnType<typeof taskFixture>>;
const fixtures: Fixture[] = [];
async function fixture(input: Parameters<typeof taskFixture>[0] = {}) {
	const result = await taskFixture(input);
	fixtures.push(result);
	return result;
}
afterEach(async () => {
	for (const f of fixtures.splice(0)) await f.close();
});
const check = {
	name: "Acceptance: value",
	command: 'test "$(cat value.txt)" = right',
	timeoutMs: 2_000,
};
async function settled(f: Fixture) {
	await eventually(
		() =>
			[
				"succeeded",
				"failed",
				"awaiting_review",
				"blocked",
				"cancelled",
				"paused",
			].includes(f.run().status),
		() => f.runner.tick(),
	);
}

describe("managed task domain", () => {
	test("requires actual checks for automatic acceptance and keeps Pi explicit", () => {
		expect(() =>
			taskContractSchema.parse({ goal: "x", completion: "checks" }),
		).toThrow();
		expect(taskContractSchema.parse({ goal: "x" }).harness).toBe("pi-acp");
		expect(taskContractSchema.parse({ goal: "x" }).completion).toBe("review");
	});
	test("light policy does not require another model, while high-risk terms strengthen guidance", () => {
		const direct = taskContractSchema.parse({ goal: "Change a label" });
		expect(resolveTaskStrategy(direct)).toBe("direct");
		expect(
			resolveTaskStrategy(
				taskContractSchema.parse({ goal: "Fix authentication" }),
			),
		).toBe("deep");
		const prompt = taskPrompt({
			runId: crypto.randomUUID(),
			iteration: 0,
			contract: direct,
		});
		expect(prompt).toContain("Start directly");
		expect(prompt).toContain("Do not commit, push, deploy");
	});
	test("create is idempotent and conflicting requests are rejected", async () => {
		const f = await fixture();
		const id = crypto.randomUUID();
		const contract = taskContractSchema.parse({ goal: "Second task" });
		const input = { id, projectId: f.projectId, contract };
		const [a, b] = await Promise.all([
			f.store.create(input),
			f.store.create(input),
		]);
		expect(a.run?.id).toBe(b.run?.id);
		await expect(
			f.store.create({
				...input,
				contract: { ...contract, goal: "Different" },
			}),
		).rejects.toThrow("reused");
	});
	test("rejects a workspace from another project", async () => {
		const f = await fixture();
		await expect(
			f.store.create({
				id: crypto.randomUUID(),
				projectId: "wrong",
				workspaceId: f.workspaceId,
				contract: f.run().contract,
			}),
		).rejects.toThrow("execution directory");
	});
	test("an accepted prompt or idle state without a candidate is not task success", async () => {
		const f = await fixture({ maxContinuations: 0 });
		await f.start();
		expect(f.run().status).toBe("running");
		expect(f.driver.submissions).toHaveLength(1);
		f.driver.finish(f.run());
		await settled(f);
		expect(f.run().status).toBe("blocked");
		expect(f.run().reason).toContain("continuation budget");
	});
	test("no machine acceptance means awaiting review, not a verified claim", async () => {
		const f = await fixture();
		await f.start();
		await f.ready();
		await settled(f);
		expect(f.run().status).toBe("awaiting_review");
		expect(f.run().completionSource).toBeNull();
		await f.runner.accept(f.runId);
		expect(f.run().status).toBe("succeeded");
		expect(f.run().completionSource).toBe("user");
	});
	test("successful command records actual output and input identity", async () => {
		const f = await fixture({ checks: [check], completion: "checks" });
		await f.start();
		writeFileSync(join(f.cwd, "value.txt"), "right\n");
		await f.ready();
		await settled(f);
		expect(f.run().status).toBe("succeeded");
		expect(f.run().completionSource).toBe("checks");
		const record = f.store.checks(f.runId)[0];
		expect(record?.exitCode).toBe(0);
		expect(record?.status).toBe("passed");
		expect(record?.pid).toBeGreaterThan(0);
		expect(record?.fingerprint).toBe(f.run().verifiedFingerprint);
	});
	test("real failure automatically resumes same session within repair budget", async () => {
		const f = await fixture({ checks: [check], completion: "checks" });
		await f.start();
		await f.ready();
		await eventually(
			() => f.driver.submissions.length === 2,
			() => f.runner.tick(),
		);
		expect(f.driver.submissions[0]?.run.sessionId).toBe(
			f.driver.submissions[1]?.run.sessionId,
		);
		expect(f.driver.submissions[1]?.prompt).toContain("Exit: 1");
		expect(f.run().repairCount).toBe(1);
		writeFileSync(join(f.cwd, "value.txt"), "right\n");
		await f.ready();
		await settled(f);
		expect(f.run().status).toBe("succeeded");
		expect(f.store.checks(f.runId).map((x) => x.status)).toEqual([
			"failed",
			"passed",
		]);
	});
	test("repair budget exhaustion does not become a success", async () => {
		const f = await fixture({
			checks: [check],
			completion: "checks",
			maxRepairs: 0,
		});
		await f.start();
		await f.ready();
		await settled(f);
		expect(f.run().status).toBe("failed");
		expect(f.driver.submissions).toHaveLength(1);
	});
	test("task report verifies session ownership and iteration", async () => {
		const f = await fixture();
		await f.start();
		const value = {
			runId: f.runId,
			iteration: 0,
			outcome: "ready",
			summary: "ready",
		};
		await expect(f.store.reportCandidate("other", value)).rejects.toThrow(
			"different session",
		);
		await expect(
			f.store.reportCandidate(f.run().sessionId, { ...value, iteration: 1 }),
		).rejects.toThrow("stale");
		await expect(
			f.store.reportCandidate(f.run().sessionId, {
				...value,
				remaining: "not tested",
			}),
		).rejects.toThrow();
	});
	test("changed code after report invalidates candidate before checking", async () => {
		const f = await fixture({ checks: [check], completion: "checks" });
		await f.start();
		await f.ready();
		writeFileSync(join(f.cwd, "value.txt"), "external change\n");
		await settled(f);
		expect(f.run().status).toBe("blocked");
		expect(f.store.checks(f.runId)).toHaveLength(0);
	});
	test("check modifying repository inputs cannot produce green evidence", async () => {
		const f = await fixture({
			checks: [{ ...check, command: "echo changed > value.txt" }],
			completion: "checks",
		});
		await f.start();
		await f.ready();
		await settled(f);
		expect(f.run().status).toBe("blocked");
		expect(f.store.checks(f.runId)[0]?.status).toBe("stale");
	});
	test("manual acceptance rejects code changes after review became ready", async () => {
		const f = await fixture();
		await f.start();
		await f.ready();
		await settled(f);
		writeFileSync(join(f.cwd, "value.txt"), "external\n");
		await expect(f.runner.accept(f.runId)).rejects.toThrow("changed");
		expect(f.run().status).toBe("blocked");
	});
	test("one managed writer per canonical directory, with durable coordination", async () => {
		const f = await fixture();
		await f.start();
		const second = await f.store.create({
			id: crypto.randomUUID(),
			projectId: f.projectId,
			contract: taskContractSchema.parse({ goal: "other" }),
		});
		if (!second.run) throw new Error("missing run");
		expect(new TaskStore(f.db).acquire(second.run.id)).toBe(false);
		await f.runner.tick();
		expect(f.driver.submissions).toHaveLength(1);
		f.runner.requestStop(f.runId, "cancelled");
		await settled(f);
		await eventually(
			() => f.driver.submissions.length === 2,
			() => f.runner.tick(),
		);
		expect(f.store.getRun(second.run.id).leasePath).not.toBeNull();
	});
	test("cancel before execution does not create a session", async () => {
		const f = await fixture();
		f.runner.requestStop(f.runId, "cancelled");
		await settled(f);
		expect(f.run().status).toBe("cancelled");
		expect(f.driver.prepareCalls).toBe(0);
	});
	test("cancel during session startup never submits a prompt afterwards", async () => {
		const f = await fixture();
		let release = () => {};
		f.driver.prepareBarrier = new Promise<void>((resolve) => {
			release = resolve;
		});
		const ticking = f.runner.tick();
		await eventually(
			() => f.driver.prepareCalls === 1,
			async () => {},
		);
		f.runner.requestStop(f.runId, "cancelled");
		release();
		await ticking;
		await settled(f);
		expect(f.driver.submissions).toHaveLength(0);
		expect(f.run().status).toBe("cancelled");
	});
	test("cancelling is not cancelled until the runtime confirms quiescence", async () => {
		const f = await fixture();
		await f.start();
		f.driver.keepRunningOnCancel = true;
		f.runner.requestStop(f.runId, "cancelled");
		await f.runner.tick();
		expect(f.run().status).toBe("cancelling");
		expect(f.run().leasePath).not.toBeNull();
		f.driver.finish(f.run(), "cancelled");
		await settled(f);
		expect(f.run().status).toBe("cancelled");
		expect(f.run().leasePath).toBeNull();
	});
	test("cancel during a real check stops the check, retains edits and never repairs", async () => {
		const f = await fixture({
			checks: [{ ...check, command: "sleep 30", timeoutMs: 60_000 }],
			completion: "checks",
		});
		await f.start();
		await f.ready();
		const checking = f.runner.tick();
		await eventually(
			() => Boolean(f.store.checks(f.runId)[0]?.pid),
			async () => {},
		);
		f.runner.requestStop(f.runId, "cancelled");
		await checking;
		await settled(f);
		expect(f.run().status).toBe("cancelled");
		expect(f.store.checks(f.runId)[0]?.status).toBe("cancelled");
		expect(f.driver.submissions).toHaveLength(1);
	});
	test("restart adopts an active session instead of repeating the initial prompt", async () => {
		const f = await fixture();
		await f.start();
		await f.restart();
		await f.runner.tick();
		expect(f.driver.submissions).toHaveLength(1);
		await f.ready();
		await settled(f);
		expect(f.run().status).toBe("awaiting_review");
	});
	test("ambiguous dispatch is not blindly resent", async () => {
		const f = await fixture();
		await f.start();
		const run = f.run();
		const state = await f.driver.inspect(run);
		f.driver.states.set(run.sessionId, {
			...state,
			status: "idle",
			lastCompletedAt: null,
			lastStopReason: null,
		});
		await f.restart();
		await f.runner.tick();
		await f.runner.tick();
		expect(f.run().status).toBe("recovering");
		expect(f.driver.submissions).toHaveLength(1);
	});
	test("interrupted checks are unknown, not silently replayed on restart", async () => {
		const f = await fixture();
		await f.start();
		await f.ready();
		f.store.patch(f.runId, { phase: "verifying" });
		f.db
			.insert(taskChecks)
			.values({
				id: crypto.randomUUID(),
				runId: f.runId,
				iteration: 0,
				checkIndex: 0,
				name: "old",
				command: "deploy-like-command",
				cwd: f.cwd,
				status: "running",
				startedAt: Date.now(),
			})
			.run();
		await f.restart();
		await f.runner.tick();
		expect(f.run().status).toBe("blocked");
		expect(f.store.checks(f.runId)[0]?.status).toBe("unknown");
	});
	test("pause and resume retain session identity and do not allow stale results", async () => {
		const f = await fixture();
		await f.start();
		const original = f.run();
		f.runner.requestStop(f.runId, "paused");
		await settled(f);
		expect(f.run().status).toBe("paused");
		await f.runner.resume(f.runId, "Keep the original scope");
		await eventually(
			() => f.driver.submissions.length === 2,
			() => f.runner.tick(),
		);
		expect(f.run().sessionId).toBe(original.sessionId);
		expect(f.run().iteration).toBe(1);
		await expect(
			f.store.reportCandidate(original.sessionId, {
				runId: f.runId,
				iteration: 0,
				outcome: "ready",
				summary: "late",
			}),
		).rejects.toThrow("stale");
	});
	test("time budget stops execution and ends failed rather than cancelling forever", async () => {
		const f = await fixture();
		await f.start();
		f.store.patch(f.runId, { deadlineAt: Date.now() - 1 });
		await settled(f);
		expect(f.run().status).toBe("failed");
		expect(f.driver.cancelCalls).toBeGreaterThan(0);
	});
	test("explicit blocker does not trigger automatic retries", async () => {
		const f = await fixture();
		await f.start();
		await f.store.reportCandidate(f.run().sessionId, {
			runId: f.runId,
			iteration: 0,
			outcome: "blocked",
			summary: "Need access",
			remaining: "Missing test account",
		});
		f.driver.finish(f.run());
		await settled(f);
		await f.runner.tick();
		expect(f.run().status).toBe("blocked");
		expect(f.run().reason).toBe("Missing test account");
		expect(f.driver.submissions).toHaveLength(1);
	});
	test("retries are durable new runs and request-id deduplicated", async () => {
		const f = await fixture();
		f.runner.requestStop(f.runId, "cancelled");
		await settled(f);
		const newId = crypto.randomUUID();
		const first = await f.runner.retry(f.taskId, newId);
		const second = await f.runner.retry(f.taskId, newId);
		expect(first.id).toBe(second.id);
		expect(first.sessionId).not.toBe(f.run().sessionId);
		expect(f.store.detail(f.taskId).runs).toHaveLength(2);
	});
	test("task records must be stopped before removal; code and conversations are not deleted", async () => {
		const f = await fixture();
		expect(() => f.store.removeTask(f.taskId)).toThrow("Cancel or finish");
		f.runner.requestStop(f.runId, "cancelled");
		await settled(f);
		expect(f.store.removalReason({ projectId: f.projectId })).toContain(
			"managed task records",
		);
		expect(f.store.removeTask(f.taskId)).toEqual({
			removed: true,
			conversationsRetained: true,
		});
		expect(f.store.list()).toHaveLength(0);
		expect(f.store.removalReason({ projectId: f.projectId })).toBeNull();
	});
	test("directory deletion reservations block concurrent task creation before any execution", async () => {
		const f = await fixture();
		f.runner.requestStop(f.runId, "cancelled");
		await settled(f);
		f.store.removeTask(f.taskId);
		const release = f.store.reserveRemoval({ workspaceId: f.workspaceId });
		try {
			await expect(
				f.store.create({
					id: crypto.randomUUID(),
					projectId: f.projectId,
					contract: taskContractSchema.parse({ goal: "cannot start" }),
				}),
			).rejects.toThrow("removal is in progress");
			expect(f.driver.submissions).toHaveLength(0);
		} finally {
			release();
		}
		expect(f.store.removalReason({ projectId: f.projectId })).toBeNull();
	});
	test("a task being created blocks directory cleanup before the foreign-key boundary", async () => {
		const f = await fixture();
		f.runner.requestStop(f.runId, "cancelled");
		await settled(f);
		f.store.removeTask(f.taskId);
		const creating = f.store.create({
			id: crypto.randomUUID(),
			projectId: f.projectId,
			contract: taskContractSchema.parse({ goal: "pending" }),
		});
		expect(() =>
			f.store.reserveRemoval({ workspaceId: f.workspaceId }),
		).toThrow("in progress");
		await creating;
	});
});
