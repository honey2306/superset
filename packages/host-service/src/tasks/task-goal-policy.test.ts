import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { taskCandidateSchema } from "@superset/shared/tasks";
import { automaticCoverageGap } from "./task-goal-policy";
import { eventually, taskFixture } from "./test-fixture";

const fixtures: Array<Awaited<ReturnType<typeof taskFixture>>> = [];
afterEach(async () => {
	for (const f of fixtures.splice(0)) await f.close();
});
async function fixture(options: Parameters<typeof taskFixture>[0] = {}) {
	const f = await taskFixture(options);
	fixtures.push(f);
	return f;
}
const check = {
	name: "Actual acceptance",
	command: "test -f value.txt",
	timeoutMs: 1000,
};
async function report(
	f: Awaited<ReturnType<typeof fixture>>,
	overrides: Record<string, unknown>,
) {
	const run = f.run();
	await f.store.reportCandidate(run.sessionId, {
		runId: run.id,
		iteration: run.iteration,
		revision: run.revision,
		outcome: "ready",
		summary: "Work report",
		...overrides,
	});
	f.driver.finish(run);
}
describe("bounded goal continuation and evidence coverage", () => {
	test("a normal premature stop continues in the SAME session instead of blocking immediately", async () => {
		const f = await fixture();
		await f.start();
		const sessionId = f.run().sessionId;
		f.driver.finish(f.run());
		await eventually(
			() => f.driver.submissions.length === 2,
			() => f.runner.tick(),
		);
		expect(f.run().continuationCount).toBe(1);
		expect(f.run().repairCount).toBe(0);
		expect(f.driver.submissions[1]?.run.sessionId).toBe(sessionId);
		expect(f.driver.submissions[1]?.prompt).toContain("do not redo it");
		await f.ready();
		await eventually(
			() => f.run().status === "awaiting_review",
			() => f.runner.tick(),
		);
		expect(f.driver.submissions).toHaveLength(2);
	});
	test("repeated missing reports stop after bounded recovery, including after Host restart", async () => {
		const f = await fixture();
		await f.start();
		f.driver.finish(f.run());
		await eventually(
			() => f.driver.submissions.length === 2,
			() => f.runner.tick(),
		);
		await f.restart();
		f.driver.finish(f.run());
		await eventually(
			() => f.driver.submissions.length === 3,
			() => f.runner.tick(),
		);
		f.driver.finish(f.run());
		await eventually(
			() => f.run().status === "blocked",
			() => f.runner.tick(),
		);
		expect(f.run().reportRecoveryCount).toBe(2);
		expect(f.driver.submissions).toHaveLength(3);
		expect(f.run().leasePath).toBeNull();
	});
	test("explicit partial progress schedules the next stage, with no verifier/model added between", async () => {
		const f = await fixture();
		await f.start();
		await report(f, {
			outcome: "continue",
			remaining: "Implement the actual fix",
			criteria: [
				{
					id: "goal",
					status: "unfinished",
					evidence: "Root cause isolated; code is not fixed",
					checkIds: [],
				},
			],
		});
		await eventually(
			() => f.driver.submissions.length === 2,
			() => f.runner.tick(),
		);
		expect(f.driver.submissions[1]?.prompt).toContain(
			"Implement the actual fix",
		);
		expect(f.store.checks(f.runId)).toHaveLength(0);
	});
	test("same progress claim on unchanged inputs stops instead of burning all budget", async () => {
		const f = await fixture({ maxContinuations: 10 });
		await f.start();
		for (let i = 0; i < 3; i++) {
			await report(f, {
				outcome: "continue",
				remaining: "Same unfinished action",
			});
			if (i < 2)
				await eventually(
					() => f.driver.submissions.length === i + 2,
					() => f.runner.tick(),
				);
		}
		await eventually(
			() => f.run().status === "blocked",
			() => f.runner.tick(),
		);
		expect(f.run().reason).toContain("No progress");
		expect(f.driver.submissions).toHaveLength(3);
	});
	test("time, cancellation, error and genuine blocker are never overridden by goal continuation", async () => {
		const f = await fixture();
		await f.start();
		await report(f, { outcome: "blocked", remaining: "Need a test account" });
		await f.runner.tick();
		expect(f.run().status).toBe("blocked");
		expect(f.driver.submissions).toHaveLength(1);
		const cancelled = await fixture();
		await cancelled.start();
		cancelled.driver.finish(cancelled.run());
		cancelled.runner.requestStop(cancelled.runId, "cancelled");
		await eventually(
			() => cancelled.run().status === "cancelled",
			() => cancelled.runner.tick(),
		);
		expect(cancelled.driver.submissions).toHaveLength(1);
	});
	test("a ready claim without coverage gets one focused follow-up, not silent green or an infinite review loop", async () => {
		const f = await fixture({ checks: [check], completion: "checks" });
		await f.start();
		await report(f, {});
		await eventually(
			() => f.driver.submissions.length === 2,
			() => f.runner.tick(),
		);
		expect(f.run().coverageRecoveryCount).toBe(1);
		await report(f, {});
		await eventually(
			() => f.run().status === "awaiting_review",
			() => f.runner.tick(),
		);
		expect(f.run().completionSource).toBeNull();
		expect(f.store.checks(f.runId)[0]?.status).toBe("passed");
		expect(f.driver.submissions).toHaveLength(2);
	});
	test("a real green static check cannot cover an explicitly unverified runtime requirement", async () => {
		const f = await fixture({
			goal: "Repair the browser behavior",
			acceptance: "Original interaction must work",
			checks: [check],
			completion: "checks",
		});
		await f.start();
		await report(f, {
			criteria: [
				{
					id: "goal",
					status: "satisfied",
					evidence: "Code changed",
					checkIds: ["task:0"],
				},
				{
					id: "acceptance",
					status: "unverified",
					evidence: "No browser reproduction performed",
					checkIds: [],
				},
			],
		});
		await eventually(
			() => f.run().status === "awaiting_review",
			() => f.runner.tick(),
		);
		expect(f.run().reason).toContain("not verified");
		expect(f.run().completionSource).toBeNull();
		expect(f.store.checks(f.runId)[0]?.exitCode).toBe(0);
	});
	test("satisfied wording without applicable executed evidence remains reviewable", async () => {
		const f = await fixture({ checks: [check], completion: "checks" });
		await f.start();
		await report(f, {
			criteria: [
				{
					id: "goal",
					status: "satisfied",
					evidence: "Looked at the code",
					checkIds: [],
				},
			],
		});
		await eventually(
			() => f.run().status === "awaiting_review",
			() => f.runner.tick(),
		);
		expect(f.run().reason).toContain("No applicable executed");
	});
	test("unknown requirements/check evidence references are rejected", async () => {
		const f = await fixture({ checks: [check] });
		await f.start();
		const run = f.run();
		await expect(
			f.store.reportCandidate(run.sessionId, {
				runId: run.id,
				iteration: 0,
				outcome: "ready",
				summary: "done",
				criteria: [
					{
						id: "invented",
						status: "satisfied",
						evidence: "claim",
						checkIds: [],
					},
				],
			}),
		).rejects.toThrow("Unknown task requirement");
		await expect(
			f.store.reportCandidate(run.sessionId, {
				runId: run.id,
				iteration: 0,
				outcome: "ready",
				summary: "done",
				criteria: [
					{
						id: "goal",
						status: "satisfied",
						evidence: "claim",
						checkIds: ["task:99"],
					},
				],
			}),
		).rejects.toThrow("Unknown acceptance evidence");
	});
	test("completed small task with valid coverage has zero continuation calls", async () => {
		const f = await fixture({ checks: [check], completion: "checks" });
		await f.start();
		await f.ready();
		await eventually(
			() => f.run().status === "succeeded",
			() => f.runner.tick(),
		);
		expect(f.run().continuationCount).toBe(0);
		expect(f.driver.submissions).toHaveLength(1);
	});
	test("goal continuation budget is separate from repairs and cannot be silently reset by changing file contents", async () => {
		const f = await fixture({ maxContinuations: 1 });
		await f.start();
		await report(f, { outcome: "continue", remaining: "First step" });
		await eventually(
			() => f.driver.submissions.length === 2,
			() => f.runner.tick(),
		);
		writeFileSync(join(f.cwd, "value.txt"), "changed\n");
		await report(f, { outcome: "continue", remaining: "Second step" });
		await eventually(
			() => f.run().status === "blocked",
			() => f.runner.tick(),
		);
		expect(f.run().reason).toContain("budget");
	});
	test("duplicate coverage and blank progress fail schema validation", () => {
		const id = crypto.randomUUID();
		expect(() =>
			taskCandidateSchema.parse({
				runId: id,
				iteration: 0,
				outcome: "continue",
				summary: "partial",
			}),
		).toThrow();
		const criterion = { id: "goal", status: "satisfied", evidence: "yes" };
		expect(() =>
			taskCandidateSchema.parse({
				runId: id,
				iteration: 0,
				outcome: "ready",
				summary: "done",
				criteria: [criterion, criterion],
			}),
		).toThrow();
	});
	test("coverage must reference selected checks, not merely an existing but unexecuted profile entry", () => {
		const report = taskCandidateSchema.parse({
			runId: crypto.randomUUID(),
			iteration: 0,
			outcome: "ready",
			summary: "done",
			criteria: [
				{
					id: "goal",
					status: "satisfied",
					evidence: "Relevant scenario",
					checkIds: ["project:not-selected"],
				},
			],
		});
		expect(
			automaticCoverageGap([{ id: "goal", description: "do this" }], report, [
				{ ...check, key: "task:0", reason: "required" },
			]),
		).toContain("No applicable executed");
	});
	test("a queued pause/resume preserves first-dispatch images even when iteration advances", async () => {
		const f = await fixture();
		const image = {
			type: "image" as const,
			data: "dGVzdA==",
			mimeType: "image/png",
		};
		f.store.patch(f.runId, { initialAttachments: [image] });
		f.runner.requestStop(f.runId, "paused");
		await eventually(
			() => f.run().status === "paused",
			() => f.runner.tick(),
		);
		await f.runner.resume(f.runId, "Continue using the original screenshot");
		await eventually(
			() => f.driver.submissions.length === 1,
			() => f.runner.tick(),
		);
		expect(f.run().iteration).toBe(1);
		expect(f.driver.submissions[0]?.attachments).toEqual([image]);
		await f.ready();
		await eventually(
			() => f.run().status === "awaiting_review",
			() => f.runner.tick(),
		);
	});
});
