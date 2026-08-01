import type { AppRouter } from "../trpc/router/router";
import type { HostServiceContext } from "../types";
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
 * `project.setup`) via `appRouter.createCaller(ctx)`. This keeps the
 * tested Git algorithms in place while giving them a durable operation
 * wrapper.
 *
 * When M4 deletes the compatibility procedures, this runner absorbs the
 * bodies directly. Until then, the mutation surface stays as-is.
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
		return runOne(request, ctx, caller);
	};
}

async function runOne(
	request: ProvisionWorkspaceRequest,
	ctx: HostServiceContext,
	caller: Caller,
): Promise<ProvisioningRunnerOutcome> {
	const warnings: Array<{ code: string; message: string }> = [];
	const launches: InitialLaunchResult[] = [];

	switch (request.project.kind) {
		case "existing": {
			const projectId = request.project.projectId;
			return runSourceAgainstExisting(
				projectId,
				request,
				ctx,
				caller,
				launches,
				warnings,
			);
		}
		case "setup-existing": {
			const setup = await caller.project.setup({
				projectId: request.project.projectId,
				origin: {
					repoCloneUrl: request.project.origin.repoUrl ?? null,
					name: request.project.origin.name,
				},
				mode:
					request.project.mode.kind === "clone"
						? {
								kind: "clone",
								parentDir: request.project.mode.parentDirectory,
							}
						: {
								kind: "import",
								repoPath: request.project.mode.path,
								allowRelocate: request.project.mode.allowRelocate ?? false,
							},
			});
			if (!setup.mainWorkspaceId) {
				throw new Error("project.setup returned no mainWorkspaceId");
			}
			return {
				projectId: request.project.projectId,
				workspaceId: setup.mainWorkspaceId,
				disposition: "created",
				launches,
				warnings,
			};
		}
		case "import": {
			const created = await caller.project.create({
				name: request.project.name,
				mode: {
					kind: "importLocal",
					repoPath: request.project.path,
					initIfNeeded: request.project.git === "initialize-with-consent",
				},
			});
			return {
				projectId: created.projectId,
				workspaceId: created.mainWorkspaceId,
				disposition: "created",
				launches,
				warnings,
			};
		}
		case "clone": {
			const created = await caller.project.create({
				name: request.project.name,
				mode: {
					kind: "clone",
					parentDir: request.project.parentDirectory,
					url: request.project.url,
				},
			});
			return {
				projectId: created.projectId,
				workspaceId: created.mainWorkspaceId,
				disposition: "created",
				launches,
				warnings,
			};
		}
		case "empty": {
			const created = await caller.project.create({
				name: request.project.name,
				mode: { kind: "empty", parentDir: request.project.parentDirectory },
			});
			return {
				projectId: created.projectId,
				workspaceId: created.mainWorkspaceId,
				disposition: "created",
				launches,
				warnings,
			};
		}
		case "template": {
			const created = await caller.project.create({
				name: request.project.name,
				mode: {
					kind: "template",
					parentDir: request.project.parentDirectory,
					url: request.project.url,
				},
			});
			return {
				projectId: created.projectId,
				workspaceId: created.mainWorkspaceId,
				disposition: "created",
				launches,
				warnings,
			};
		}
		case "temporary": {
			// Best-effort MVP: reuse the singleton temporary project if it
			// already exists. Full materialization (mkdir + project row
			// creation at `<homedir>/Superset/temporary`) lives in the
			// temporary source handler under `sources/temporary.ts`.
			const existing = ctx.db.query.projects
				.findFirst({
					where: (row, { eq }) =>
						eq(
							row.singletonKey,
							request.project.kind === "temporary"
								? request.project.singletonKey
								: "default",
						),
				})
				.sync();
			if (existing) {
				const main = ctx.db.query.workspaces
					.findFirst({
						where: (w, { and, eq }) =>
							and(eq(w.projectId, existing.id), eq(w.type, "main")),
					})
					.sync();
				return {
					projectId: existing.id,
					workspaceId: main?.id ?? existing.id,
					disposition: "reused",
					launches,
					warnings,
				};
			}
			throw new Error(
				"temporary provisioning not yet materialized (M2 MVP scaffold)",
			);
		}
	}
}

async function runSourceAgainstExisting(
	projectId: string,
	request: ProvisionWorkspaceRequest,
	ctx: HostServiceContext,
	caller: Caller,
	launches: InitialLaunchResult[],
	warnings: Array<{ code: string; message: string }>,
): Promise<ProvisioningRunnerOutcome> {
	const source = request.source;
	switch (source.kind) {
		case "main": {
			const row = ctx.db.query.workspaces
				.findFirst({
					where: (w, { and, eq }) =>
						and(eq(w.projectId, projectId), eq(w.type, "main")),
				})
				.sync();
			if (!row) throw new Error("PROJECT_NOT_FOUND: no main workspace");
			return {
				projectId,
				workspaceId: row.id,
				disposition: "reused",
				launches,
				warnings,
			};
		}
		case "branch": {
			const branch =
				source.name.kind === "explicit" ? source.name.value : undefined;
			const result = await caller.workspaces.create({
				projectId,
				branch,
				baseBranch: source.from.kind === "ref" ? source.from.value : undefined,
				taskId: request.display?.taskId,
				name: request.display?.name,
			});
			return {
				projectId,
				workspaceId: result.workspace.id,
				disposition: result.alreadyExists ? "reused" : "created",
				launches,
				warnings,
			};
		}
		case "worktree": {
			const result = await caller.workspaceCreation.adopt({
				projectId,
				workspaceName: request.display?.name ?? source.path,
				branch: source.expectedBranch ?? "",
				worktreePath: source.path,
			});
			return {
				projectId,
				workspaceId: result.workspace.id,
				disposition: "adopted",
				launches,
				warnings,
			};
		}
		case "pull-request": {
			const result = await caller.workspaces.create({
				projectId,
				pr: source.number,
				taskId: request.display?.taskId,
				name: request.display?.name,
			});
			return {
				projectId,
				workspaceId: result.workspace.id,
				disposition: result.alreadyExists ? "reused" : "created",
				launches,
				warnings,
			};
		}
	}
}
