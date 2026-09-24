import { createHash, randomUUID } from "node:crypto";
import type { SelectedTaskCheck } from "@superset/shared/tasks";
import { eq } from "drizzle-orm";
import { taskChecks } from "../../db/schema";
import { adaptTaskStrategy } from "../task-policy";
import type { TaskRun, TaskStore } from "../task-store";
import { type CheckResult, runTaskCheck } from "./check-runner";
import { changedTaskPaths, chooseTaskChecks } from "./check-selection";
import type { fingerprintWorktree } from "./worktree-fingerprint";

export type VerificationSnapshot = Awaited<
	ReturnType<typeof fingerprintWorktree>
>;
export interface TaskVerificationCapability {
	select(
		run: TaskRun,
		snapshot: VerificationSnapshot,
	): {
		paths: string[] | null;
		policy: ReturnType<typeof adaptTaskStrategy>;
		checks: SelectedTaskCheck[];
	};
	run(input: {
		run: TaskRun;
		snapshot: VerificationSnapshot;
		selected: SelectedTaskCheck[];
		signal: AbortSignal;
		isCurrent: () => boolean;
	}): Promise<{ failure: string | null; failureKey: string | null }>;
}
const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

/** Executes existing approved checks and records facts. It never starts agents,
 * changes acceptance requirements, chooses skills, or marks a Task successful. */
export class ProjectTaskVerification implements TaskVerificationCapability {
	constructor(
		private readonly store: TaskStore,
		private readonly check = runTaskCheck,
	) {}
	select(run: TaskRun, snapshot: VerificationSnapshot) {
		let paths = changedTaskPaths(run.baselineChanges, snapshot.changes);
		if (paths?.length === 0 && snapshot.fingerprint !== run.baselineFingerprint)
			paths = null;
		const policy = adaptTaskStrategy({
			contract: run.contract,
			paths,
			repairCount: run.repairCount,
		});
		const selected = chooseTaskChecks({
			contract: run.contract,
			profile: run.profile,
			paths,
			strategy: policy.strategy,
			additionalIds: run.candidate?.additionalCheckIds,
		});
		return { paths, policy, checks: selected };
	}
	async run({
		run,
		snapshot,
		selected,
		signal,
		isCurrent,
	}: Parameters<TaskVerificationCapability["run"]>[0]) {
		let failure: string | null = null;
		let failureKey: string | null = null;
		for (const [index, check] of selected.entries()) {
			if (!isCurrent() || signal.aborted) break;
			const reused = check.reuse
				? this.store
						.checks(run.id)
						.find(
							(item) =>
								item.revision === run.revision &&
								item.checkKey === check.key &&
								item.command === check.command &&
								item.status === "passed" &&
								item.fingerprint === snapshot.fingerprint,
						)
				: null;
			if (reused) {
				this.store.event(
					run.id,
					"check_reused",
					`${check.name}: reused explicitly cacheable check ${reused.id} on identical inputs and requirements`,
				);
				continue;
			}
			const id = randomUUID();
			this.store.db
				.insert(taskChecks)
				.values({
					id,
					runId: run.id,
					iteration: run.iteration,
					revision: run.revision,
					checkKey: check.key,
					selectionReason: check.reason,
					checkIndex: index,
					name: check.name,
					command: check.command,
					cwd: run.cwd,
					status: "running",
					fingerprint: snapshot.fingerprint,
					startedAt: Date.now(),
				})
				.run();
			let result: CheckResult;
			try {
				result = await this.check({
					check,
					cwd: run.cwd,
					signal: signal,
					onStart: (pid) => {
						this.store.db
							.update(taskChecks)
							.set({ pid })
							.where(eq(taskChecks.id, id))
							.run();
					},
				});
			} catch (error) {
				result = {
					status: signal.aborted ? "cancelled" : "failed",
					exitCode: null,
					output: errorMessage(error),
				};
			}
			this.store.db
				.update(taskChecks)
				.set({ ...result, endedAt: Date.now() })
				.where(eq(taskChecks.id, id))
				.run();
			if (result.status !== "passed") {
				failureKey = createHash("sha256")
					.update(
						JSON.stringify([
							check.key,
							check.command,
							result.exitCode,
							snapshot.fingerprint,
						]),
					)
					.digest("hex");
				failure = `${check.name}\nCommand: ${check.command}\nExit: ${result.exitCode ?? "unknown"}\n${result.output.slice(-12_000)}`;
				break;
			}
		}
		return { failure, failureKey };
	}
}
