import { runTaskCheck } from "./checks/check-runner";
import { ProjectTaskVerification } from "./checks/task-verification";
import type { fingerprintWorktree } from "./checks/worktree-fingerprint";
import { GitTaskDelivery } from "./delivery/git-delivery";
import type { TaskDeliveryCapability } from "./delivery/task-delivery-capability";
import type { TaskExecutionDriver } from "./execution-driver";
import { TaskRunner } from "./task-runner";
import type { TaskStore } from "./task-store";

/** Composition is the only place that chooses concrete optional executors.
 * Skill/memory discovery stays in the Agent resource layer, not in TaskRunner. */
export function createTaskRunner(options: {
	store: TaskStore;
	driver: TaskExecutionDriver;
	fingerprint?: typeof fingerprintWorktree;
	check?: typeof runTaskCheck;
	delivery?: TaskDeliveryCapability;
}) {
	return new TaskRunner({
		...options,
		verification: new ProjectTaskVerification(
			options.store,
			options.check ?? runTaskCheck,
		),
		delivery: options.delivery ?? new GitTaskDelivery(options.store),
	});
}
