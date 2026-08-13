import { basename } from "node:path";
import { BRANCH_PREFIX_MODES } from "@superset/shared/workspace-launch";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import {
	emitProjectChanged,
	toProjectSnapshot,
	updateLocalProject,
} from "../../../projects/local-project-store";
import { deleteLocalWorkspace } from "../../../workspaces/local-workspace-store";
import { protectedProcedure, router } from "../../index";
import {
	normalizeSparseCheckoutPaths,
	parseSparseCheckoutPaths,
	serializeSparseCheckoutPaths,
} from "../workspace-creation/shared/sparse-checkout";
import { normalizeWorktreeBaseDir } from "../workspace-creation/shared/worktree-paths";
import {
	resolveLocalRepo,
	tryRevParseGitRoot,
	validateDirectoryPath,
} from "./utils/resolve-repo";

export const projectRouter = router({
	list: protectedProcedure.query(({ ctx }) => {
		return ctx.db
			.select()
			.from(projects)
			.all()
			.map((row) => ({
				id: row.id,
				// Empty until the backfill sweep fills it; folder name is the
				// honest fallback (same rule as toProjectSnapshot).
				name: row.name || basename(row.repoPath),
				repoPath: row.repoPath,
				repoOwner: row.repoOwner,
				repoName: row.repoName,
				repoUrl: row.repoUrl,
				worktreeBaseDir: row.worktreeBaseDir,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt || row.createdAt,
			}));
	}),

	/** Rename. Commits locally — projects have no cloud dependency. */
	update: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				name: z.string().min(1),
			}),
		)
		.mutation(({ ctx, input }) => {
			const row = updateLocalProject(
				{ db: ctx.db, eventBus: ctx.eventBus, catalog: ctx.catalog },
				input.projectId,
				{ name: input.name },
			);
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			return toProjectSnapshot(row);
		}),

	get: protectedProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.query(({ ctx, input }) => {
			const row = ctx.db
				.select()
				.from(projects)
				.where(eq(projects.id, input.projectId))
				.get();
			if (!row) return null;
			return {
				id: row.id,
				// Same fallback rule as project.list / toProjectSnapshot.
				name: row.name || basename(row.repoPath),
				repoPath: row.repoPath,
				repoOwner: row.repoOwner,
				repoName: row.repoName,
				repoUrl: row.repoUrl,
				worktreeBaseDir: row.worktreeBaseDir,
				branchPrefixMode: row.branchPrefixMode,
				branchPrefixCustom: row.branchPrefixCustom,
				sparseCheckoutPaths: parseSparseCheckoutPaths(row.sparseCheckoutPaths),
			};
		}),

	setSparseCheckoutPaths: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				paths: z.array(z.string().max(1024)).max(1000),
			}),
		)
		.mutation(({ ctx, input }) => {
			const paths = normalizeSparseCheckoutPaths(input.paths);
			const updated = ctx.db
				.update(projects)
				.set({ sparseCheckoutPaths: serializeSparseCheckoutPaths(paths) })
				.where(eq(projects.id, input.projectId))
				.returning({ id: projects.id })
				.get();
			if (!updated)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			return { sparseCheckoutPaths: paths };
		}),

	setWorktreeBaseDir: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				path: z.string().nullable(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const worktreeBaseDir = normalizeWorktreeBaseDir(input.path);
			const project = ctx.catalog.updateProject(input.projectId, {
				worktreeBaseDir,
			});
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}

			return {
				id: project.id,
				worktreeBaseDir: project.worktreeBaseDir ?? null,
			};
		}),

	/**
	 * Set this project's branch-prefix override. A `null` mode clears the
	 * override so the project falls back to the host-wide default.
	 */
	setBranchPrefix: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				mode: z.enum(BRANCH_PREFIX_MODES).nullable(),
				customPrefix: z.string().nullable().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const updated = ctx.catalog.updateProject(input.projectId, {
				branchPrefixMode: input.mode,
				branchPrefixCustom: input.customPrefix ?? null,
			});
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Project not set up locally: ${input.projectId}`,
				});
			}
			return { success: true as const };
		}),

	findBackfillConflict: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				repoPath: z.string().min(1),
			}),
		)
		.query(() => {
			// Multiple v2 projects may point at the same GitHub URL, so a matching
			// repo URL is no longer a conflict. Kept for backwards-compatible
			// clients while older settings screens still call the endpoint.
			return { conflict: null };
		}),

	findByPath: protectedProcedure
		.input(z.object({ repoPath: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			// Detect "folder isn't a git repo yet" without throwing, so the import
			// UI can offer to initialize it instead of dead-ending on BAD_REQUEST.
			const root = await tryRevParseGitRoot(input.repoPath);
			if (root === null) {
				validateDirectoryPath(input.repoPath, "Path");
				return { candidates: [], needsGitInit: true as const };
			}

			const { repoPath: gitRoot } = await resolveLocalRepo(root);
			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.repoPath, gitRoot) })
				.sync();
			if (!localProject) return { candidates: [] };

			return {
				candidates: [
					{
						id: localProject.id,
						name:
							localProject.name || localProject.repoName || basename(gitRoot),
					},
				],
			};
		}),

	/**
	 * Project-delete saga. Local is reality — the local deletes are the
	 * commit point, run first, and are fully offline-capable:
	 *
	 *   1. Ownership check: an id this host doesn't serve is a no-op —
	 *      never a legacy cloud delete.
	 *
	 *   2. Best-effort `git worktree remove` for each non-main local
	 *      workspace so subsequent worktree commands aren't confused.
	 *
	 *   3. Local DB rows (workspaces + project). A failure here surfaces as
	 *      an error — the local table is what the UI lists from, so a
	 *      swallowed failure would toast "Deleted" over a surviving row.
	 *
	 * The on-disk repo directory is NEVER auto-removed. The user's code is
	 * their code; deletion of the working tree must be an explicit action,
	 * not a side-effect of project removal. Returns repoPath so a future
	 * UI can offer an explicit "delete files too" follow-up.
	 */
	remove: protectedProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();
			if (!localProject) return { success: true, repoPath: null };

			const localWorkspaces = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, input.projectId))
				.all();

			for (const ws of localWorkspaces) {
				if (ws.worktreePath === localProject.repoPath) continue;
				try {
					const git = await ctx.git(localProject.repoPath);
					await git.raw(["worktree", "remove", ws.worktreePath]);
				} catch (err) {
					console.warn("[project.remove] failed to remove worktree", {
						projectId: input.projectId,
						worktreePath: ws.worktreePath,
						err,
					});
				}
			}

			try {
				// Route both cascade deletes and the project delete through
				// the Catalog so the journal reflects one atomic clear.
				for (const ws of localWorkspaces) {
					deleteLocalWorkspace(
						{ db: ctx.db, eventBus: ctx.eventBus, catalog: ctx.catalog },
						ws.id,
					);
				}
				ctx.catalog.deleteProject(input.projectId);
				emitProjectChanged(ctx.eventBus, "deleted", input.projectId);
			} catch (err) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to delete project locally: ${err instanceof Error ? err.message : String(err)}`,
				});
			}

			return { success: true, repoPath: localProject.repoPath };
		}),
});
