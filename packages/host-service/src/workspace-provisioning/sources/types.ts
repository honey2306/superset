/**
 * Source-specific handlers (execplan §File map).
 *
 * `sources/` decomposes the production runner's big `switch (project.kind)`
 * into one file per `ProjectTarget × WorkspaceSource` shape. Each handler
 * receives the host context and durable journal and returns a
 * `ProvisioningRunnerOutcome`.
 *
 * Split rationale (execplan §Commit and compensation): every source needs
 * its own resolve → materialize → catalog-commit → runtime sequence, and
 * its Git receipts must be independently resumable.
 */

import type { HostServiceContext } from "../../types";
import type { OperationJournal } from "../operation-journal";
import type { InitialLaunchResult, ProvisionWorkspaceRequest } from "../types";
import type { ProvisioningRunnerOutcome } from "../workspace-provisioning";

export interface SourceHandlerContext {
	request: ProvisionWorkspaceRequest;
	operationId: string;
	journal: OperationJournal;
	ctx: HostServiceContext;
	launches: InitialLaunchResult[];
	warnings: Array<{ code: string; message: string }>;
}

export type SourceHandler = (
	args: SourceHandlerContext,
) => Promise<ProvisioningRunnerOutcome>;

export function sourceStepKey(
	context: SourceHandlerContext,
	stepName: string,
): string {
	return `source:${context.request.project.kind}:${context.request.source.kind}:${stepName}`;
}

/**
 * Journal an external source/materializer call separately from the outer
 * source receipt. If the host dies after the materializer returns
 * but before the parent operation advances, retry can reuse the returned
 * identity instead of calling Git/materialization a second time.
 */
export async function runSourceStep<T extends object>(
	context: SourceHandlerContext,
	stepName: string,
	input: Record<string, unknown>,
	work: () => Promise<T>,
): Promise<T> {
	const stepKey = `source:${context.request.project.kind}:${context.request.source.kind}:${stepName}`;
	const completed = context.journal.getCompletedStepOutput<
		Record<string, unknown>
	>(context.operationId, stepKey);
	if (completed) return completed as T;

	context.journal.markStepStarted(context.operationId, stepKey, input);
	const output = await work();
	context.journal.markStepComplete(
		context.operationId,
		stepKey,
		output as Record<string, unknown>,
	);
	return output;
}

/**
 * Like `runSourceStep`, but lets a materializer reconcile a completed receipt
 * against the external Git/filesystem state before trusting it. A receipt is
 * only a hint until the resource it describes still exists; this is what
 * makes a retry after a crash safe in both directions (no duplicate worktree
 * and no stale receipt pointing at a deleted one).
 */
export async function runReconciledSourceStep<T extends object>(
	context: SourceHandlerContext,
	stepName: string,
	input: Record<string, unknown>,
	isValid: (output: T) => Promise<boolean>,
	work: () => Promise<T>,
): Promise<T> {
	const stepKey = sourceStepKey(context, stepName);
	const completed = context.journal.getCompletedStepOutput<T>(
		context.operationId,
		stepKey,
	);
	if (completed && (await isValid(completed))) return completed;

	context.journal.markStepStarted(context.operationId, stepKey, input);
	const output = await work();
	context.journal.markStepComplete(
		context.operationId,
		stepKey,
		output as Record<string, unknown>,
	);
	return output;
}
