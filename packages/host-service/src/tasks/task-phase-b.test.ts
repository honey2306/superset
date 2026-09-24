import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { taskContractSchema, taskProfileSchema } from "@superset/shared/tasks";
import {
	changedTaskPaths,
	chooseTaskChecks,
	matchesTaskPath,
} from "./checks/check-selection";
import { fingerprintWorktree } from "./checks/worktree-fingerprint";
import { adaptTaskStrategy, taskPrompt } from "./task-policy";
import { eventually, taskFixture } from "./test-fixture";

type Fixture = Awaited<ReturnType<typeof taskFixture>>;
const fixtures: Fixture[] = [];
async function fixture(options: Parameters<typeof taskFixture>[0] = {}) {
	const f = await taskFixture(options);
	fixtures.push(f);
	return f;
}
afterEach(async () => {
	for (const f of fixtures.splice(0)) await f.close();
});
const projectProfile = () =>
	taskProfileSchema.parse({
		instructions: "Do not change unrelated public APIs",
		completion: "checks",
		checks: [
			{
				id: "value",
				name: "Value",
				command: 'test "$(cat value.txt)" = right',
				paths: ["value.txt"],
			},
			{
				id: "unrelated",
				name: "Unrelated",
				command: "exit 17",
				paths: ["other/**"],
			},
		],
	});
async function projectTask(
	f: Fixture,
	acceptanceMode: "project" | "review" = "project",
) {
	f.runner.requestStop(f.runId, "cancelled");
	await f.runner.tick();
	f.store.profiles.save(f.projectId, 0, projectProfile());
	const detail = await f.store.create({
		id: crypto.randomUUID(),
		projectId: f.projectId,
		acceptanceMode,
		contract: taskContractSchema.parse({ goal: "Fix the value" }),
	});
	if (!detail.run) throw new Error("missing run");
	return detail.run.id;
}
async function report(
	f: Fixture,
	id: string,
	outcome: "ready" | "blocked" = "ready",
) {
	const run = f.store.getRun(id);
	await f.store.reportCandidate(run.sessionId, {
		runId: id,
		iteration: run.iteration,
		revision: run.revision,
		outcome,
		criteria: f.store.requirements(run.id).map((item) => ({
			id: item.id,
			status: "satisfied",
			evidence: "Fixture behavior check",
			checkIds: [
				...run.contract.checks.map((_, i) => `task:${i}`),
				...(run.profile?.config.checks.map((check) => `project:${check.id}`) ??
					[]),
			],
		})),
		summary: "Ready",
		remaining: outcome === "blocked" ? "needs info" : "",
	});
	f.driver.finish(run);
}
async function settle(f: Fixture, id = f.runId) {
	await eventually(
		() =>
			[
				"succeeded",
				"awaiting_review",
				"blocked",
				"failed",
				"paused",
				"cancelled",
			].includes(f.store.getRun(id).status),
		() => f.runner.tick(),
	);
}
function guidance(f: Fixture, text = "Do not change public APIs") {
	const run = f.run();
	return {
		id: crypto.randomUUID(),
		runId: run.id,
		expectedRevision: run.revision,
		text,
		kind: "guidance" as const,
	};
}

describe("project rules and scoped verification", () => {
	test("glob dialect handles recursive zero-directory matches without accepting traversal", () => {
		expect(matchesTaskPath("**/*.ts", "index.ts")).toBe(true);
		expect(matchesTaskPath("src/*.ts", "src/a/b.ts")).toBe(false);
		expect(matchesTaskPath("src/**/?.tsx", "src/a.tsx")).toBe(true);
		expect(matchesTaskPath("src/**/?.tsx", "src/a/b.tsx")).toBe(true);
		expect(() =>
			taskProfileSchema.parse({
				checks: [
					{ id: "bad", name: "bad", command: "true", paths: ["../secret"] },
				],
			}),
		).toThrow();
	});
	test("profile updates are version-checked and do not mutate an existing run snapshot", async () => {
		const f = await fixture();
		const id = await projectTask(f);
		f.store.profiles.save(f.projectId, 1, {
			...projectProfile(),
			instructions: "New defaults",
		});
		expect(f.store.getRun(id).profile?.revision).toBe(1);
		expect(f.store.getRun(id).profile?.config.instructions).not.toBe(
			"New defaults",
		);
		expect(() =>
			f.store.profiles.save(f.projectId, 1, projectProfile()),
		).toThrow("changed");
	});
	test("discovery only suggests existing check scripts without executing scripts or hooks", async () => {
		const f = await fixture();
		writeFileSync(
			join(f.cwd, "package.json"),
			JSON.stringify({
				packageManager: "bun@1.3.14",
				scripts: {
					test: "touch should-not-exist",
					deploy: "echo no",
					typecheck: "tsc --noEmit",
				},
			}),
		);
		const found = await f.store.profiles.discover(f.projectId);
		expect(found.suggestions.map((x) => x.id)).toEqual(["test", "typecheck"]);
		expect(f.store.profiles.get(f.projectId).revision).toBe(0);
		expect(await Bun.file(join(f.cwd, "should-not-exist")).exists()).toBe(
			false,
		);
	});
	test("project defaults run only relevant checks, no per-task commands needed", async () => {
		const f = await fixture();
		const id = await projectTask(f);
		await f.runner.tick();
		writeFileSync(join(f.cwd, "value.txt"), "right\n");
		await report(f, id);
		await settle(f, id);
		const run = f.store.getRun(id);
		expect(run.status).toBe("succeeded");
		expect(run.selectedChecks?.map((x) => x.key)).toEqual(["project:value"]);
		expect(f.store.checks(id)).toHaveLength(1);
		expect(run.effectiveStrategy).toBe("direct");
		expect(run.metrics?.executingMs).toBeGreaterThanOrEqual(0);
		expect(run.metrics?.snapshotsMs).toBeGreaterThan(0);
	});
	test("explicit review still runs applicable project checks but does not auto-accept", async () => {
		const f = await fixture();
		const id = await projectTask(f, "review");
		await f.runner.tick();
		writeFileSync(join(f.cwd, "value.txt"), "right\n");
		await report(f, id);
		await settle(f, id);
		expect(f.store.getRun(id).status).toBe("awaiting_review");
		expect(f.store.checks(id)).toHaveLength(1);
	});
	test("no applicable check never becomes vacuous auto-success", async () => {
		const f = await fixture();
		const id = await projectTask(f);
		await f.runner.tick();
		await report(f, id);
		await settle(f, id);
		expect(f.store.getRun(id).status).toBe("awaiting_review");
		expect(f.store.checks(id)).toHaveLength(0);
	});
	test("unrelated pre-existing edits do not expand task scope, while shared config does", async () => {
		const f = await fixture();
		mkdirSync(join(f.cwd, "other"));
		writeFileSync(join(f.cwd, "other", "preexisting.txt"), "user work");
		const before = await fingerprintWorktree(f.cwd);
		writeFileSync(join(f.cwd, "value.txt"), "right\n");
		const after = await fingerprintWorktree(f.cwd);
		expect(changedTaskPaths(before.changes ?? null, after.changes)).toEqual([
			"value.txt",
		]);
		const selected = chooseTaskChecks({
			contract: f.run().contract,
			profile: { revision: 1, config: projectProfile() },
			paths: ["bun.lock"],
			strategy: "direct",
		});
		expect(selected).toHaveLength(2);
	});
	test("unknown added check ids are rejected and suggestions cannot remove mandatory checks", () => {
		const profile = { revision: 1, config: projectProfile() };
		const contract = taskContractSchema.parse({
			goal: "x",
			checks: [{ name: "required", command: "true" }],
		});
		expect(
			chooseTaskChecks({
				contract,
				profile,
				paths: ["value.txt"],
				strategy: "direct",
				additionalIds: ["unrelated"],
			}),
		).toHaveLength(3);
		expect(() =>
			chooseTaskChecks({
				contract,
				profile,
				paths: [],
				strategy: "direct",
				additionalIds: ["made-up"],
			}),
		).toThrow("Unknown");
	});
	test("auto strategy strengthens on evidence but a localized task has no classifier stage", () => {
		const contract = taskContractSchema.parse({ goal: "Fix value" });
		expect(
			adaptTaskStrategy({ contract, paths: ["value.txt"], repairCount: 0 })
				.strategy,
		).toBe("direct");
		expect(
			adaptTaskStrategy({ contract, paths: ["value.txt"], repairCount: 1 })
				.strategy,
		).toBe("standard");
		expect(
			adaptTaskStrategy({ contract, paths: ["value.txt"], repairCount: 2 })
				.strategy,
		).toBe("deep");
		expect(taskPrompt({ runId: "test", iteration: 0, contract })).toContain(
			"\n\n",
		);
	});
	test("same failed check on unchanged inputs stops after three attempts instead of consuming all retries", async () => {
		const f = await fixture({
			completion: "checks",
			maxRepairs: 8,
			checks: [{ name: "fail", command: "exit 3", timeoutMs: 1000 }],
		});
		await f.start();
		for (let i = 0; i < 3; i++) {
			await report(f, f.runId);
			if (i < 2)
				await eventually(
					() => f.driver.submissions.length === i + 2,
					() => f.runner.tick(),
				);
		}
		await settle(f);
		expect(f.run().status).toBe("blocked");
		expect(f.run().reason).toContain("repeatedly");
		expect(f.driver.submissions).toHaveLength(3);
	});
});

describe("explicit evidence reuse", () => {
	for (const reuse of [false, true])
		test(`reuse=${reuse} respects opt-in and unchanged inputs`, async () => {
			const f = await fixture({
				completion: "checks",
				maxRepairs: 1,
				checks: [
					{
						name: "stable local check",
						command: "printf checked",
						timeoutMs: 1000,
						reuse,
					},
					{ name: "failing check", command: "exit 5", timeoutMs: 1000 },
				],
			});
			await f.start();
			await f.ready();
			await eventually(
				() => f.driver.submissions.length === 2,
				() => f.runner.tick(),
			);
			await f.ready();
			await settle(f);
			expect(f.run().status).toBe("failed");
			expect(
				f.store
					.checks(f.runId)
					.filter((item) => item.name === "stable local check"),
			).toHaveLength(reuse ? 1 : 2);
			expect(
				f.store.checks(f.runId).filter((item) => item.name === "failing check"),
			).toHaveLength(2);
		});
	test("changed requirements invalidate even explicitly cacheable checks", async () => {
		const f = await fixture({
			checks: [
				{ name: "stable", command: "true", timeoutMs: 1000, reuse: true },
			],
		});
		await f.start();
		await f.ready();
		await settle(f);
		expect(f.run().status).toBe("awaiting_review");
		f.runner.addGuidance(
			guidance(f, "Verify the same work against this additional explanation"),
		);
		await eventually(
			() => f.driver.submissions.length === 2,
			() => f.runner.tick(),
		);
		await f.ready();
		await settle(f);
		expect(f.store.checks(f.runId)).toHaveLength(2);
		expect(f.store.checks(f.runId).map((item) => item.revision)).toEqual([
			0, 1,
		]);
	});
});

describe("revisioned live guidance", () => {
	test("completion survives real-runtime journal compaction epoch reset", async () => {
		const f = await fixture();
		await f.start();
		await f.ready();
		const state = await f.driver.inspect(f.run());
		f.driver.states.set(f.run().sessionId, {
			...state,
			epoch: "compacted-epoch",
			lastSeq: 1,
		});
		await settle(f);
		expect(f.run().status).toBe("awaiting_review");
	});

	test("guidance before start is bundled without an extra prompt or native injection", async () => {
		const f = await fixture();
		f.runner.addGuidance(guidance(f));
		await f.start();
		expect(f.driver.submissions).toHaveLength(1);
		expect(f.driver.guidanceCalls).toHaveLength(0);
		expect(f.driver.submissions[0]?.prompt).toContain(
			"Do not change public APIs",
		);
		expect(f.store.guidance.list(f.runId)[0]?.status).toBe("delivered");
		await f.ready();
		await settle(f);
		expect(f.run().status).toBe("awaiting_review");
	});
	test("running task receives guidance in the same turn, old revision cannot report success", async () => {
		const f = await fixture();
		await f.start();
		f.runner.addGuidance(guidance(f));
		await f.runner.tick();
		expect(f.driver.guidanceCalls).toHaveLength(1);
		expect(f.driver.submissions).toHaveLength(1);
		expect(f.driver.cancelCalls).toBe(0);
		await expect(
			f.store.reportCandidate(f.run().sessionId, {
				runId: f.runId,
				iteration: 0,
				revision: 0,
				outcome: "ready",
				summary: "old",
			}),
		).rejects.toThrow("stale");
		await f.ready();
		await settle(f);
		expect(f.run().status).toBe("awaiting_review");
	});
	test("guidance is request-idempotent and stale writers cannot overwrite requirements", async () => {
		const f = await fixture();
		await f.start();
		const input = guidance(f);
		const first = f.runner.addGuidance(input);
		const again = f.runner.addGuidance(input);
		expect(again.id).toBe(first.id);
		expect(f.run().revision).toBe(1);
		expect(() =>
			f.runner.addGuidance({ ...input, id: crypto.randomUUID() }),
		).toThrow("changed");
		expect(() => f.runner.addGuidance({ ...input, text: "different" })).toThrow(
			"reused",
		);
	});
	test("lost native delivery acknowledgement is not blindly retried after Host restart", async () => {
		const f = await fixture();
		await f.start();
		f.driver.guidanceError = true;
		f.runner.addGuidance(guidance(f));
		await f.runner.tick();
		expect(f.store.guidance.list(f.runId)[0]?.status).toBe("unknown");
		await f.restart();
		await f.runner.tick();
		await f.runner.tick();
		expect(f.driver.guidanceCalls).toHaveLength(1);
		f.driver.finish(f.run());
		await settle(f);
		expect(f.run().status).toBe("blocked");
		f.driver.guidanceError = false;
		await f.runner.resume(f.runId, "Apply the recorded instruction");
		await eventually(
			() => f.driver.submissions.length === 2,
			() => f.runner.tick(),
		);
		expect(f.store.guidance.list(f.runId)[0]?.deliveryMode).toBe("bundled");
	});
	test("queued ACP guidance is labelled queued, not pretended to be native", async () => {
		const f = await fixture({ harness: "myflicker-acp" });
		await f.start();
		f.driver.guidanceMode = "queued";
		f.runner.addGuidance(guidance(f));
		await f.runner.tick();
		expect(f.store.guidance.list(f.runId)[0]?.deliveryMode).toBe("queued");
		expect(f.driver.cancelCalls).toBe(0);
	});
	test("new guidance while verifying interrupts obsolete checks and continues without manual pause", async () => {
		const f = await fixture({
			completion: "checks",
			checks: [{ name: "slow", command: "sleep 20", timeoutMs: 30_000 }],
		});
		await f.start();
		await f.ready();
		const checking = f.runner.tick();
		await eventually(
			() => Boolean(f.store.checks(f.runId)[0]?.pid),
			async () => {},
		);
		f.runner.addGuidance({
			...guidance(f),
			kind: "constraint",
			text: "Preserve the old API",
		});
		await checking;
		await eventually(
			() => f.driver.submissions.length === 2,
			() => f.runner.tick(),
		);
		expect(f.run().status).toBe("running");
		expect(f.run().revision).toBe(1);
		expect(f.run().completionSource).toBeNull();
		expect(f.store.checks(f.runId)[0]?.status).toBe("cancelled");
		expect(f.driver.submissions[1]?.prompt).toContain("Preserve the old API");
	});
	test("a ready result is invalidated immediately when additional requirements arrive", async () => {
		const f = await fixture();
		await f.start();
		await f.ready();
		await settle(f);
		f.runner.addGuidance(guidance(f, "Also cover the empty input case"));
		await expect(f.runner.accept(f.runId)).rejects.toThrow();
		await eventually(
			() => f.driver.submissions.length === 2,
			() => f.runner.tick(),
		);
		expect(f.run().candidate).toBeNull();
	});
	test("new acceptance requirements do not inherit an old automatic-check coverage claim", async () => {
		const f = await fixture({
			completion: "checks",
			checks: [{ name: "baseline", command: "true", timeoutMs: 1000 }],
		});
		await f.start();
		f.runner.addGuidance({
			...guidance(f, "Also satisfy a new user-visible requirement"),
			kind: "constraint",
		});
		await f.runner.tick();
		await f.ready();
		await settle(f);
		expect(f.run().acceptanceMode).toBe("review");
		expect(f.run().status).toBe("awaiting_review");
		expect(f.store.checks(f.runId)[0]?.status).toBe("passed");
		expect(f.run().completionSource).toBeNull();
	});
	test("create checks the project revision the user actually reviewed", async () => {
		const f = await fixture();
		f.store.profiles.save(f.projectId, 0, projectProfile());
		await expect(
			f.store.create({
				id: crypto.randomUUID(),
				projectId: f.projectId,
				acceptanceMode: "project",
				expectedProfileRevision: 0,
				contract: f.run().contract,
			}),
		).rejects.toThrow("profile changed");
	});

	test("a cancelled task never accepts new guidance or restarts from delayed delivery", async () => {
		const f = await fixture();
		await f.start();
		f.runner.requestStop(f.runId, "cancelled");
		expect(() => f.runner.addGuidance(guidance(f))).toThrow("stopped");
		await settle(f);
		expect(f.driver.submissions).toHaveLength(1);
	});
});
