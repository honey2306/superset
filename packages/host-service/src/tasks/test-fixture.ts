import { Database } from "bun:sqlite";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { SessionScopedState } from "@superset/session-protocol";
import type { TaskImage } from "@superset/shared/tasks";
import { type TaskContract, taskContractSchema } from "@superset/shared/tasks";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { AcpSessionNotFoundError } from "../runtime/acp-sessions/acp-sessions";
import { GitTaskDelivery } from "./delivery/git-delivery";
import type { TaskExecutionDriver } from "./execution-driver";
import { createTaskRunner } from "./task-composition";
import { type TaskRun, TaskStore } from "./task-store";

export class FakeTaskDriver implements TaskExecutionDriver {
	states = new Map<string, SessionScopedState>();
	submissions: { run: TaskRun; prompt: string; attachments: TaskImage[] }[] =
		[];
	prepareCalls = 0;
	cancelCalls = 0;
	guidanceCalls: Array<{ run: TaskRun; text: string; commandId: string }> = [];
	guidanceError = false;
	guidanceMode: "native" | "queued" = "native";
	prepareBarrier?: Promise<void>;
	keepRunningOnCancel = false;
	private changed = () => {};
	async prepare(run: TaskRun, workspaceId: string) {
		this.prepareCalls++;
		if (this.prepareBarrier) await this.prepareBarrier;
		const state = this.states.get(run.sessionId) ?? {
			sessionId: run.sessionId,
			workspaceId,
			harness: run.contract.harness,
			epoch: "test-epoch",
			status: "idle" as const,
			title: null,
			currentMode: null,
			configOptions: [],
			availableCommands: null,
			pendingPermissions: [],
			queuedPrompts: [],
			cwd: run.cwd,
			lastSeq: 1,
			lastStopReason: null,
			lastError: null,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		this.states.set(run.sessionId, state);
		return state;
	}
	async submit(run: TaskRun, prompt: string, attachments: TaskImage[] = []) {
		this.submissions.push({ run, prompt, attachments });
		const state = this.states.get(run.sessionId);
		if (!state) throw new AcpSessionNotFoundError("Missing session");
		this.states.set(run.sessionId, {
			...state,
			status: "running",
			lastSeq: state.lastSeq + 1,
			lastStopReason: null,
			lastError: null,
		});
		this.changed();
	}
	async inspect(run: TaskRun) {
		const state = this.states.get(run.sessionId);
		if (!state) throw new AcpSessionNotFoundError("Missing session");
		return state;
	}
	async cancel(run: TaskRun) {
		this.cancelCalls++;
		if (!this.keepRunningOnCancel) this.finish(run, "cancelled");
	}
	async guide(
		run: TaskRun,
		text: string,
		commandId: string,
	): Promise<"native" | "queued"> {
		this.guidanceCalls.push({ run, text, commandId });
		if (this.guidanceError) throw new Error("guidance acknowledgement lost");
		return this.guidanceMode;
	}
	finish(run: TaskRun, stopReason: "end_turn" | "cancelled" = "end_turn") {
		const state = this.states.get(run.sessionId);
		if (!state) throw new Error("Missing fake session");
		this.states.set(run.sessionId, {
			...state,
			status: "idle",
			lastSeq: state.lastSeq + 5,
			lastStopReason: stopReason,
			lastCompletedAt: Date.now(),
		});
		this.changed();
	}
	onChanged(handler: () => void) {
		this.changed = handler;
		return () => {
			this.changed = () => {};
		};
	}
}

export async function taskFixture(contract: Partial<TaskContract> = {}) {
	const directory = mkdtempSync(join(tmpdir(), "superset-task-test-"));
	const cwd = join(directory, "repo");
	mkdirSync(cwd);
	execFileSync("git", ["init", "-q", cwd]);
	writeFileSync(join(cwd, "value.txt"), "wrong\n");
	execFileSync("git", ["add", "value.txt"], { cwd });
	execFileSync(
		"git",
		[
			"-c",
			"user.name=Task Test",
			"-c",
			"user.email=task-test@example.invalid",
			"-c",
			"core.hooksPath=/dev/null",
			"commit",
			"-qm",
			"fixture",
		],
		{ cwd },
	);
	const sqlite = new Database(join(directory, "test.db"));
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, {
		migrationsFolder: resolve(import.meta.dir, "../../drizzle"),
	});
	sqlite.run("PRAGMA foreign_keys = ON");
	const projectId = crypto.randomUUID(),
		workspaceId = crypto.randomUUID();
	db.insert(schema.projects)
		.values({ id: projectId, repoPath: cwd, name: "Fixture" })
		.run();
	db.insert(schema.workspaces)
		.values({
			id: workspaceId,
			projectId,
			worktreePath: cwd,
			branch: "main",
			type: "main",
		})
		.run();
	const store = new TaskStore(db),
		driver = new FakeTaskDriver();
	const delivery = new GitTaskDelivery(store);
	let runner = createTaskRunner({ store, driver, delivery });
	const task = await store.create({
		id: crypto.randomUUID(),
		projectId,
		contract: taskContractSchema.parse({
			goal: "Change value to right",
			...contract,
		}),
	});
	if (!task.run) throw new Error("Missing run");
	const runId = task.run.id;
	return {
		directory,
		cwd,
		sqlite,
		db,
		store,
		driver,
		delivery,
		taskId: task.task.id,
		projectId,
		workspaceId,
		runId,
		get runner() {
			return runner;
		},
		run: () => store.getRun(runId),
		async start() {
			await runner.tick();
		},
		async ready() {
			const run = store.getRun(runId);
			await store.reportCandidate(run.sessionId, {
				runId,
				iteration: run.iteration,
				revision: run.revision,
				outcome: "ready",
				summary: "Changed and ready for checks",
				criteria: store.requirements(run.id).map((item) => ({
					id: item.id,
					status: "satisfied",
					evidence: "Fixture observation of the requested behavior",
					checkIds: [
						...run.contract.checks.map((_, i) => `task:${i}`),
						...(run.profile?.config.checks.map(
							(check) => `project:${check.id}`,
						) ?? []),
					],
				})),
			});
			driver.finish(run);
		},
		async restart() {
			await runner.dispose();
			runner = createTaskRunner({ store: new TaskStore(db), driver, delivery });
		},
		async close() {
			await runner.dispose();
			sqlite.close();
			rmSync(directory, { recursive: true, force: true });
		},
	};
}
export async function eventually(
	check: () => boolean,
	tick: () => Promise<void>,
	timeout = 15_000,
) {
	const deadline = Date.now() + timeout;
	while (!check()) {
		if (Date.now() > deadline) throw new Error("Condition did not become true");
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}
