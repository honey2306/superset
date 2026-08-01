import type { AppRouter } from "../trpc/router/router";
import type { HostServiceContext } from "../types";
import {
	existingProjectHandler,
	projectMaterializerHandler,
	setupExistingHandler,
	temporaryHandler,
} from "./sources";
import type { InitialLaunchResult, ProvisionWorkspaceRequest } from "./types";
import type {
	ProvisioningRunner,
	ProvisioningRunnerOutcome,
} from "./workspace-provisioning";

type Caller = ReturnType<AppRouter["createCaller"]>;

/**
 * Production runner for the Provisioning saga. The M2 MVP delegates each
 * `(ProjectTarget, WorkspaceSource)` pair to the existing tRPC mutations
 * (`workspaces.create`, `workspaceCreation.adopt`, `project.create`,
 * `project.setup`) via `appRouter.createCaller(ctx)`. Dispatch happens
 * in this file; per-source logic lives in `./sources/*.ts` so each
 * source can grow its own git materializer without shuffling the
 * others.
 *
 * When M4 deletes the compatibility procedures, each source handler
 * absorbs its git body directly. Until then, the caller layer is the
 * seam.
 */

export interface ProvisioningRunnerAdapters {
	appRouter: AppRouter;
	ctxFactory: () => HostServiceContext;
}

export function createProductionRunner(
	adapters: ProvisioningRunnerAdapters,
): ProvisioningRunner {
	return async ({ request }) => {
		const ctx = adapters.ctxFactory();
		const caller = adapters.appRouter.createCaller(
			ctx as unknown as Parameters<AppRouter["createCaller"]>[0],
		);
		return dispatch(request, ctx, caller);
	};
}

async function dispatch(
	request: ProvisionWorkspaceRequest,
	ctx: HostServiceContext,
	caller: Caller,
): Promise<ProvisioningRunnerOutcome> {
	const warnings: Array<{ code: string; message: string }> = [];
	const launches: InitialLaunchResult[] = [];
	const handlerCtx = { request, ctx, caller, launches, warnings };
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
}
