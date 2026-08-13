import type { HostServiceContext } from "../types";
import {
	existingProjectHandler,
	projectMaterializerHandler,
	setupExistingHandler,
	temporaryHandler,
} from "./sources";
import type { InitialLaunchResult } from "./types";
import type {
	ProvisioningRunner,
	ProvisioningRunnerOutcome,
	RunnerArtifact,
} from "./workspace-provisioning";

/**
 * Production runner for the Provisioning saga. Source handlers receive the
 * host context directly; legacy tRPC procedures remain adapters for old
 * clients and are not part of the new provisioning retry path.
 */

export interface ProvisioningRunnerAdapters {
	ctxFactory: () => HostServiceContext;
}

export function createProductionRunner(
	adapters: ProvisioningRunnerAdapters,
): ProvisioningRunner {
	return async (runnerContext) => {
		const ctx = adapters.ctxFactory();
		return dispatch(runnerContext, ctx);
	};
}

async function dispatch(
	runnerContext: Parameters<ProvisioningRunner>[0],
	ctx: HostServiceContext,
): Promise<ProvisioningRunnerOutcome> {
	const { request, operationId, journal } = runnerContext;
	runnerContext.throwIfCancellationRequested();
	const stepKey = `source:${request.project.kind}:${request.source.kind}`;
	const completed = journal.getCompletedStepOutput<SourceStepOutput>(
		operationId,
		stepKey,
	);
	if (completed) {
		return completed;
	}
	journal.markStepStarted(operationId, stepKey, {
		projectKind: request.project.kind,
		sourceKind: request.source.kind,
	});
	const warnings: Array<{ code: string; message: string }> = [];
	const launches: InitialLaunchResult[] = [];
	const handlerCtx = {
		request,
		operationId,
		journal,
		ctx,
		launches,
		warnings,
		throwIfCancellationRequested: runnerContext.throwIfCancellationRequested,
		beginCatalogCommit: runnerContext.beginCatalogCommit,
		markCatalogCommitted: runnerContext.markCatalogCommitted,
	};
	const outcome = await (async () => {
		switch (request.project.kind) {
			case "existing":
				return existingProjectHandler(handlerCtx);
			case "setup-existing":
				return setupExistingHandler(handlerCtx);
			case "import":
			case "clone":
			case "empty":
			case "template":
				return projectMaterializerHandler(handlerCtx);
			case "temporary":
				return temporaryHandler(handlerCtx);
		}
	})();
	journal.markStepComplete(
		operationId,
		stepKey,
		serializeSourceOutcome(outcome),
	);
	return outcome;
}

type SourceStepOutput = {
	projectId: string;
	workspaceId: string;
	disposition: "created" | "adopted" | "reused" | "repaired";
	launches: InitialLaunchResult[];
	warnings: Array<{ code: string; message: string }>;
	artifacts?: RunnerArtifact[];
};

function serializeSourceOutcome(
	outcome: ProvisioningRunnerOutcome,
): Record<string, unknown> {
	return {
		projectId: outcome.projectId,
		workspaceId: outcome.workspaceId,
		disposition: outcome.disposition,
		launches: outcome.launches,
		warnings: outcome.warnings,
		artifacts: outcome.artifacts,
	};
}
