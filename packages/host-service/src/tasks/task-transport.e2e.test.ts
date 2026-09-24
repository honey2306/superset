import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { taskContractSchema, taskProfileSchema } from "@superset/shared/tasks";
import { createTaskTransportFixture } from "./task-transport-fixture";

async function wait<T>(
	get: () => Promise<T>,
	done: (value: T) => boolean,
	label: string,
	timeout = 30000,
): Promise<T> {
	const deadline = Date.now() + timeout;
	let result: T;
	for (;;) {
		result = await get();
		if (done(result)) return result;
		if (Date.now() > deadline)
			throw new Error(`${label}: ${JSON.stringify(result)}`);
		await new Promise((resolve) => setTimeout(resolve, 40));
	}
}
test("real HTTP Host → detached ACP daemon → Pi adapter/SDK → MCP result → Host check and repair", async () => {
	const f = await createTaskTransportFixture({ delayMs: 100 });
	try {
		await f.api.tasks.saveProfile.mutate({
			projectId: f.projectId,
			expectedRevision: 0,
			config: taskProfileSchema.parse({
				completion: "checks",
				checks: [
					{
						id: "value",
						name: "value acceptance",
						command: 'test "$(cat value.txt)" = right',
						paths: ["value.txt"],
					},
				],
			}),
		});
		const task = await f.api.tasks.create.mutate({
			id: crypto.randomUUID(),
			projectId: f.projectId,
			acceptanceMode: "project",
			expectedProfileRevision: 1,
			contract: taskContractSchema.parse({
				goal: "Write right into value.txt",
				model: "task-local/task-model",
			}),
		});
		const result = await wait(
			() => f.api.tasks.get.query({ id: task.task.id }),
			(data) =>
				["succeeded", "failed", "blocked"].includes(data.run?.status ?? ""),
			"task did not finish",
		);
		expect(result.run?.reason).toBe(
			"All explicitly selected acceptance checks passed on unchanged inputs",
		);
		expect(result.run?.status).toBe("succeeded");
		expect(result.run?.repairCount).toBe(1);
		expect(result.checks.map((check) => check.status)).toEqual([
			"failed",
			"passed",
		]);
		expect(readFileSync(join(f.cwd, "value.txt"), "utf8")).toBe("right\n");
		expect(f.modelRequests).toBe(6);
		expect(
			f.modelInputs.every(
				(input) =>
					input.tools.includes("report_task_result") &&
					!input.tools.includes("delegate"),
			),
		).toBe(true);
		if (!result.run) throw new Error("missing run");
		const state = await f.api.acpSessions.get.query({
			sessionId: result.run.sessionId,
		});
		expect(state.status).toBe("idle");
		expect(state.canSteer).toBe(true);
		const messages = await f.api.acpSessions.getTranscript.query({
			sessionId: result.run.sessionId,
		});
		expect(messages.totalTurns).toBe(2);
		expect(JSON.stringify(messages)).toContain("Candidate reported.");
		expect(result.run.candidate?.summary).toBe(
			"Candidate emitted through real MCP and daemon",
		);
	} catch (error) {
		const rows = await f.api.tasks.list.query();
		const run = rows[0]?.run;
		const state = run ? await f.daemon.get(run.sessionId) : null;
		throw new Error(
			`${String(error)}\nACTUAL SESSION ${JSON.stringify(state)}\n${f.logs()}`,
		);
	} finally {
		await f.close();
	}
}, 60000);

test("live Pi steering and closing a view preserve the real task lifecycle", async () => {
	const f = await createTaskTransportFixture({ delayMs: 400 });
	try {
		await f.api.tasks.saveProfile.mutate({
			projectId: f.projectId,
			expectedRevision: 0,
			config: taskProfileSchema.parse({
				completion: "checks",
				checks: [
					{
						id: "value",
						name: "value",
						command: 'test "$(cat value.txt)" = right',
						paths: ["value.txt"],
					},
				],
			}),
		});
		const task = await f.api.tasks.create.mutate({
			id: crypto.randomUUID(),
			projectId: f.projectId,
			acceptanceMode: "project",
			contract: taskContractSchema.parse({
				goal: "Write right into value.txt",
				model: "task-local/task-model",
			}),
		});
		const executing = await wait(
			() => f.api.tasks.get.query({ id: task.task.id }),
			() => f.modelRequests > 0,
			"model never started",
		);
		if (!executing.run) throw new Error("missing run");
		const guidance = {
			id: crypto.randomUUID(),
			runId: executing.run.id,
			expectedRevision: 0,
			text: "Preserve unrelated files; continue to the acceptance check",
			kind: "guidance" as const,
		};
		await f.api.tasks.guide.mutate(guidance);
		await f.api.acpSessions.close.mutate({
			sessionId: executing.run.sessionId,
		});
		const delivered = await wait(
			() => f.api.tasks.get.query({ id: task.task.id }),
			(data) => data.guidance[0]?.status === "delivered",
			"guidance not delivered",
		);
		expect(delivered.guidance[0]?.deliveryMode).toBe("native");
		expect(delivered.run?.desiredState).toBe("running");
		const result = await wait(
			() => f.api.tasks.get.query({ id: task.task.id }),
			(data) =>
				["succeeded", "blocked", "failed"].includes(data.run?.status ?? ""),
			"steered task did not finish",
		);
		expect(result.run?.status).toBe("succeeded");
		expect(result.run?.revision).toBe(1);
		expect(result.run?.candidate?.revision).toBe(1);
		expect(result.run?.sessionId).toBe(executing.run.sessionId);
		const again = await f.api.tasks.guide.mutate(guidance);
		expect(again.id).toBe(guidance.id);
		// A second, slower task exercises actual provider-stream cancellation.
		f.setDelay(1500);
		const cancelled = await f.api.tasks.create.mutate({
			id: crypto.randomUUID(),
			projectId: f.projectId,
			contract: taskContractSchema.parse({
				goal: "Try another local edit",
				model: "task-local/task-model",
			}),
		});
		const previousRequests = f.modelRequests;
		const active = await wait(
			() => f.api.tasks.get.query({ id: cancelled.task.id }),
			() => f.modelRequests > previousRequests,
			"cancel test did not start",
		);
		if (!active.run) throw new Error("missing run");
		await f.api.tasks.cancel.mutate({ runId: active.run.id });
		const stopped = await wait(
			() => f.api.tasks.get.query({ id: cancelled.task.id }),
			(data) => data.run?.status === "cancelled",
			"cancel not confirmed",
			10000,
		);
		expect(stopped.run?.leasePath).toBeNull();
		expect(stopped.run?.completionSource).toBeNull();
	} catch (error) {
		throw new Error(`${String(error)}\n${f.logs()}`);
	} finally {
		await f.close();
	}
}, 60000);

test("real daemon native mutation provenance authorizes a verified task-only commit and local-remote push", async () => {
	const f = await createTaskTransportFixture();
	try {
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: f.cwd, encoding: "utf8" }).trim();
		git("config", "user.name", "Task test");
		git("config", "user.email", "task-test@example.invalid");
		git("config", "commit.gpgsign", "false");
		const branch = git("branch", "--show-current"),
			remote = join(f.directory, "delivery-remote.git");
		git("init", "--bare", "-q", remote);
		git("remote", "add", "delivery", remote);
		git("push", "-q", "delivery", `HEAD:refs/heads/${branch}`);
		const target = (
			await f.api.tasks.deliveryTargets.query({ workspaceId: f.workspaceId })
		).remotes.find((item) => item.remote === "delivery");
		if (!target) throw new Error("missing remote");
		const id = crypto.randomUUID();
		await f.api.tasks.create.mutate({
			id,
			projectId: f.projectId,
			contract: taskContractSchema.parse({
				goal: "Write right into value.txt",
				model: "task-local/task-model",
				checks: [{ name: "value", command: 'test "$(cat value.txt)" = right' }],
				completion: "checks",
				delivery: {
					mode: "push",
					branch,
					message: "fix(task): native verified delivery",
					remote: "delivery",
					remoteBranch: branch,
					targetHash: target.targetHash,
				},
			}),
		});
		const deadline = Date.now() + 20000;
		let result = await f.api.tasks.get.query({ id });
		while (
			result.run &&
			!["succeeded", "failed", "blocked"].includes(result.run.status) &&
			Date.now() < deadline
		) {
			await new Promise((done) => setTimeout(done, 100));
			result = await f.api.tasks.get.query({ id });
		}
		expect(result.run?.reason).toContain(
			"confirmed at the selected remote branch",
		);
		expect(result.run?.status).toBe("succeeded");
		expect(result.operations.map((op) => op.status)).toEqual([
			"confirmed",
			"confirmed",
		]);
		expect(result.checks.map((check) => check.status)).toEqual([
			"failed",
			"passed",
		]);
		if (!result.run) throw new Error("missing run");
		expect(f.store.edits(result.run.id)).toHaveLength(2);
		expect(git("status", "--porcelain")).toBe("");
	} finally {
		await f.close();
	}
}, 30000);
