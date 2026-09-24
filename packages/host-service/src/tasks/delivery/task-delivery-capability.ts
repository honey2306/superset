import type { TaskRun } from "../task-store";

/** Deliberately one narrow optional capability, not a plugin registry/workflow
 * engine. Runtime owns authorization/lifecycle; implementation owns real effects. */
export interface TaskDeliveryCapability {
	execute(
		run: TaskRun,
		signal: AbortSignal,
	): Promise<{ summary: string } | null>;
	hasUnresolved(run: TaskRun): boolean;
	reconcile(run: TaskRun): Promise<void>;
	releasePrepared(run: TaskRun): Promise<void>;
	retry(run: TaskRun): Promise<void>;
}
