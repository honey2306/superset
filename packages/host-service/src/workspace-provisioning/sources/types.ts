/** Source-specific handlers and durable side-effect checkpoints. */

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
	throwIfCancellationRequested: () => void;
	beginCatalogCommit: () => void;
	markCatalogCommitted: (args: {
		projectId: string;
		workspaceId: string;
	}) => void;
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

export async function runSourceStep<T extends object>(
	context: SourceHandlerContext,
	stepName: string,
	input: Record<string, unknown>,
	work: () => Promise<T>,
): Promise<T> {
	context.throwIfCancellationRequested();
	const stepKey = sourceStepKey(context, stepName);
	const completed = context.journal.getCompletedStepOutput<
		Record<string, unknown>
	>(context.operationId, stepKey);
	if (completed) return completed as T;

	context.journal.markStepStarted(context.operationId, stepKey, input);
	const output = await work();
	context.throwIfCancellationRequested();
	context.journal.markStepComplete(
		context.operationId,
		stepKey,
		output as Record<string, unknown>,
	);
	return output;
}

export async function runReconciledSourceStep<T extends object>(
	context: SourceHandlerContext,
	stepName: string,
	input: Record<string, unknown>,
	isValid: (output: T) => Promise<boolean>,
	work: () => Promise<T>,
): Promise<T> {
	context.throwIfCancellationRequested();
	const stepKey = sourceStepKey(context, stepName);
	const completed = context.journal.getCompletedStepOutput<T>(
		context.operationId,
		stepKey,
	);
	if (completed && (await isValid(completed))) return completed;

	context.journal.markStepStarted(context.operationId, stepKey, input);
	const output = await work();
	context.throwIfCancellationRequested();
	context.journal.markStepComplete(
		context.operationId,
		stepKey,
		output as Record<string, unknown>,
	);
	return output;
}

/** Claim the cancellation boundary before entering a Catalog transaction. */
export async function runCatalogCommitStep<
	T extends { projectId: string; workspaceId: string },
>(
	context: SourceHandlerContext,
	stepName: string,
	input: Record<string, unknown>,
	work: () => Promise<T>,
): Promise<T> {
	const stepKey = sourceStepKey(context, stepName);
	const completed = context.journal.getCompletedStepOutput<T>(
		context.operationId,
		stepKey,
	);
	if (completed) {
		context.markCatalogCommitted(completed);
		return completed;
	}
	context.throwIfCancellationRequested();
	context.journal.markStepStarted(context.operationId, stepKey, input);
	context.beginCatalogCommit();
	const output = await work();
	context.markCatalogCommitted(output);
	context.journal.markStepComplete(
		context.operationId,
		stepKey,
		output as Record<string, unknown>,
	);
	return output;
}
