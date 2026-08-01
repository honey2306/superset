/**
 * Source-specific handlers (execplan §File map).
 *
 * `sources/` decomposes the production runner's big `switch (project.kind)`
 * into one file per `ProjectTarget × WorkspaceSource` shape. Each handler
 * receives the tRPC caller + host context and returns a
 * `ProvisioningRunnerOutcome`.
 *
 * Split rationale (execplan §Commit and compensation): every source needs
 * its own resolve → materialize → catalog-commit → runtime sequence, and
 * the git algorithms live in different tRPC procedures today. Keeping
 * one file per source lets a future PR replace the `caller.workspaces.*`
 * delegation with direct git calls without shuffling the branch/PR/
 * temporary logic together.
 *
 * Until that PR lands the handlers still delegate through
 * `appRouter.createCaller(ctx)` — the module boundary is what matters.
 */

import type { AppRouter } from "../../trpc/router/router";
import type { HostServiceContext } from "../../types";
import type { InitialLaunchResult, ProvisionWorkspaceRequest } from "../types";
import type { ProvisioningRunnerOutcome } from "../workspace-provisioning";

export type Caller = ReturnType<AppRouter["createCaller"]>;

export interface SourceHandlerContext {
	request: ProvisionWorkspaceRequest;
	ctx: HostServiceContext;
	caller: Caller;
	launches: InitialLaunchResult[];
	warnings: Array<{ code: string; message: string }>;
}

export type SourceHandler = (
	args: SourceHandlerContext,
) => Promise<ProvisioningRunnerOutcome>;
