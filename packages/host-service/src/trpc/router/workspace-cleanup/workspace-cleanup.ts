import { existsSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../db/schema";
import { invalidateLabelCache } from "../../../ports/static-ports";
import { runTeardown, type TeardownResult } from "../../../runtime/teardown";
import { disposeSessionsByWorkspaceId } from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import type { GitTaskEnv } from "../../../workers/tasks/git";
import { deleteLocalWorkspace } from "../../../workspaces/local-workspace-store";
import type {
	DeleteInProgressCause,
	TeardownFailureCause,
} from "../../error-types";
import { protectedProcedure, router } from "../../index";
import { requireLocalProject } from "../workspace-creation/shared/local-project";
import { normalizeWorktreePath } from "../workspace-creation/shared/worktree-list";
import { cleanupGitOps, isIndeterminateGitTaskFailure } from "./git-ops";
import { isMainWorkspace } from "./is-main-workspace";

/**
 * Process-local guard against concurrent destroys of the same workspace.
 * A second caller observes the live entry and gets a typed CONFLICT (with
 * `DELETE_IN_PROGRESS` cause) so the renderer can render a toast instead
 * of mistaking it for a dirty-worktree race and silently force-retrying.
 *
 * Doesn't survive a host-service crash mid-delete — but neither does the
 * destroy itself, and the saga is idempotent enough that a second attempt
 * after restart is safe.
 */
const destroysInFlight = new Set<string>();

/** @internal — exposed for tests to introspect / clear the guard. */
export const __testDestroysInFlight = destroysInFlight;

export interface DestroyWorkspaceInput {
	workspaceId: string;
	deleteBranch: boolean;
	force: boolean;
}

/**
 * Discriminated so the renderer can't accidentally treat
 * `{ canDelete: false, reason: null }` as a no-op — it's an unrepresentable
 * combination at the type level.
 */
type InspectResult =
	| {
			canDelete: true;
			reason: null;
			hasChanges: boolean;
			hasUnpushedCommits: boolean;
	  }
	| {
			canDelete: false;
			reason: string;
			hasChanges: false;
			hasUnpushedCommits: false;
	  };

export const workspaceCleanupRouter = router({
	/**
	 * Status preview for the v2 delete dialog. Co-located with `destroy` so
	 * the two can never disagree about what's blocked vs warned.
	 *
	 * Contract:
	 *   - canDelete: false      → render `reason` as a blocking banner.
	 *   - hasChanges/Unpushed   → render as warnings; user can still confirm.
	 *   - git failures (missing worktree, broken repo) → return as canDelete
	 *     with no warnings; the destroy saga handles those states best-effort.
	 *
	 * Unpushed-commit detection uses `rev-list --not --remotes` so brand-new
	 * branches with no upstream still report unpushed commits correctly.
	 */
	inspect: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ ctx, input, signal }): Promise<InspectResult> => {
			const main = await isMainWorkspace(ctx, input.workspaceId);
			if (main.isMain) {
				return {
					canDelete: false,
					reason: main.reason,
					hasChanges: false,
					hasUnpushedCommits: false,
				};
			}

			const { local } = main;
			if (!local) {
				return {
					canDelete: true,
					reason: null,
					hasChanges: false,
					hasUnpushedCommits: false,
				};
			}

			try {
				const gitEnv = await cleanupGitOps.resolveGitEnv(
					ctx,
					local.worktreePath,
				);
				const state = await cleanupGitOps.readWorktreeState(
					{ worktreePath: local.worktreePath, gitEnv },
					signal,
				);
				return {
					canDelete: true,
					reason: null,
					hasChanges: state.hasChanges,
					hasUnpushedCommits: state.hasUnpushedCommits,
				};
			} catch {
				return {
					canDelete: true,
					reason: null,
					hasChanges: false,
					hasUnpushedCommits: false,
				};
			}
		}),

	/**
	 * Destroy a workspace in five phases:
	 *
	 *   0. Preflight     — dirty-worktree check (skip if force)
	 *   1. Teardown      — run .superset/teardown.sh (skip if force)
	 *   2. Local cleanup — PTYs, worktree
	 *   3. Host sqlite   — local catalog cleanup
	 *   4. Branch delete — optional local branch cleanup
	 *   5. Caches        — invalidate process-local state
	 *
	 * Worktree removal is intentionally before the local catalog delete. If it
	 * fails while the path still exists, the row remains visible and deletion
	 * can be retried instead of orphaning disk state.
	 *
	 * Force semantics:
	 *   - skips preflight (step 0)
	 *   - skips teardown  (step 1)
	 *   - step 2b always uses `--force --force`
	 *   - step 4 always uses `-D` regardless: the `deleteBranch`
	 *     checkbox is the user's consent, so refusing unmerged branches
	 *     would just silently drop the opt-in.
	 *
	 * Typed errors for the renderer:
	 *   - CONFLICT             → dirty worktree; prompt force-retry.
	 *                            CONFLICT with `data.deleteInProgress` is a
	 *                            different beast — another destroy is in
	 *                            flight for the same workspace; surface as
	 *                            a toast and do NOT force-retry.
	 *   - INTERNAL_SERVER_ERROR with `data.teardownFailure` → teardown
	 *                            script failed; prompt force-retry
	 *   - BAD_REQUEST          → main workspace; cannot be deleted
	 */
	destroy: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				deleteBranch: z.boolean().default(false),
				force: z.boolean().default(false),
			}),
		)
		.mutation(async ({ ctx, input }) => destroyWorkspace(ctx, input)),

	/**
	 * Remove a live git worktree that no longer has any Workspace row on
	 * this host — leftover state from v1 sessions or a manual
	 * `git worktree add`. The Catalog list can offer clean-up without
	 * inventing a synthetic workspace id.
	 *
	 * Contract:
	 *   - The path MUST NOT match any existing workspace row in `workspaces`.
	 *     If it does, the caller should use `destroy` instead so terminals
	 *     and Catalog identity are torn down properly.
	 *   - The path MUST NOT be the project's canonical main repo path.
	 *   - `git worktree remove` with `--force --force` handles locked or
	 *     manually-cleared directories; missing state is idempotent.
	 */
	destroyOrphanWorktree: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				worktreePath: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const project = requireLocalProject(ctx, input.projectId);
			const target = normalizeWorktreePath(input.worktreePath);

			if (normalizeWorktreePath(project.repoPath) === target) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Refusing to remove the project's main repository",
				});
			}

			const adopted = ctx.db
				.select({ id: workspaces.id, worktreePath: workspaces.worktreePath })
				.from(workspaces)
				.where(eq(workspaces.projectId, input.projectId))
				.all()
				.find((row) => normalizeWorktreePath(row.worktreePath) === target);
			if (adopted) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `Worktree is adopted by workspace ${adopted.id}; use destroy instead`,
				});
			}

			let gitEnv: GitTaskEnv;
			try {
				gitEnv = await cleanupGitOps.resolveGitEnv(ctx, project.repoPath);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to open project repo at ${project.repoPath}: ${message}`,
				});
			}

			let stillRegistered = true;
			try {
				({ stillRegistered } = await cleanupGitOps.removeWorktree({
					repoPath: project.repoPath,
					worktreePath: target,
					gitEnv,
				}));
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to verify worktree removal at ${input.worktreePath}: ${message}`,
				});
			}
			if (stillRegistered) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to remove worktree at ${input.worktreePath}`,
				});
			}

			return {
				success: true as const,
				worktreeStillOnDisk: existsSync(input.worktreePath),
			};
		}),
});

export async function destroyWorkspace(
	ctx: HostServiceContext,
	input: DestroyWorkspaceInput,
) {
	if (destroysInFlight.has(input.workspaceId)) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Deletion already in progress for this workspace",
			cause: { kind: "DELETE_IN_PROGRESS" } satisfies DeleteInProgressCause,
		});
	}
	destroysInFlight.add(input.workspaceId);
	try {
		return await runDestroy(ctx, input);
	} finally {
		destroysInFlight.delete(input.workspaceId);
	}
}

async function runDestroy(
	ctx: HostServiceContext,
	input: DestroyWorkspaceInput,
) {
	const warnings: string[] = [];

	// `isMainWorkspace` already loads workspace + project rows from sqlite;
	// thread them through to avoid duplicate sync queries downstream.
	const main = await isMainWorkspace(ctx, input.workspaceId);
	if (main.isMain) {
		throw new TRPCError({ code: "BAD_REQUEST", message: main.reason });
	}
	const { local, project } = main;

	// ─── Step 0: Preflight ─────────────────────────────────────────
	// Block only on dirty worktree (the common "I forgot to commit"
	// case). Missing/broken local state is handled by the cleanup phase.
	if (!input.force && local && project) {
		try {
			const gitEnv = await cleanupGitOps.resolveGitEnv(ctx, local.worktreePath);
			const state = await cleanupGitOps.readWorktreeState({
				worktreePath: local.worktreePath,
				gitEnv,
			});
			if (state.hasChanges) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Worktree has uncommitted changes",
				});
			}
		} catch (err) {
			if (err instanceof TRPCError) throw err;
			if (isIndeterminateGitTaskFailure(err)) {
				const message = err instanceof Error ? err.message : String(err);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Couldn't verify worktree state at ${local.worktreePath}: ${message}`,
				});
			}
			// Can't read status (missing worktree dir, etc.) — not a
			// conflict. Continue; step 3b will skip idempotently.
		}
	}

	// ─── Step 1: Teardown ──────────────────────────────────────────
	// Script is the user's last chance to stop services / flush state
	// before the workspace goes away. Failure here is recoverable
	// via force-retry, which skips this step.
	if (!input.force && local && project) {
		const teardown: TeardownResult = await runTeardown({
			db: ctx.db,
			workspaceId: input.workspaceId,
			worktreePath: local.worktreePath,
			repoPath: project.repoPath,
			projectId: local.projectId,
		});
		if (teardown.status === "failed") {
			const cause: TeardownFailureCause = {
				kind: "TEARDOWN_FAILED",
				exitCode: teardown.exitCode,
				signal: teardown.signal,
				timedOut: teardown.timedOut,
				outputTail: teardown.outputTail,
			};
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Teardown script failed",
				cause,
			});
		}
	}

	// ─── Step 2: Local cleanup ─────────────────────────────────────
	// 2a. PTYs
	try {
		const killed = await disposeSessionsByWorkspaceId(
			input.workspaceId,
			ctx.db,
		);
		if (killed.failed > 0) {
			warnings.push(`${killed.failed} terminal(s) may still be running`);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		warnings.push(`Failed to dispose terminal sessions: ${message}`);
	}

	// 2b. Worktree. Double-force unlocks the rare locked-worktree case and
	//     clears stale metadata when the directory was manually removed.
	let worktreeRemoved = false;
	let branchDeleted = false;
	let repoGitEnv: GitTaskEnv | null = null;
	if (local && !project) {
		worktreeRemoved = !existsSync(local.worktreePath);
		if (!worktreeRemoved) {
			warnings.push(
				`Skipped worktree removal at ${local.worktreePath}: project metadata is missing`,
			);
		}
	}
	if (local && project) {
		worktreeRemoved = !existsSync(local.worktreePath);
		try {
			repoGitEnv = await cleanupGitOps.resolveGitEnv(ctx, project.repoPath);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (!worktreeRemoved) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to open project repo at ${project.repoPath}: ${message}`,
				});
			}
			warnings.push(
				`Failed to open project repo at ${project.repoPath}: ${message}`,
			);
		}

		if (repoGitEnv) {
			// A task failure means post-remove state is unknown: block instead
			// of committing the catalog delete and orphaning disk state.
			let stillRegistered = true;
			try {
				({ stillRegistered } = await cleanupGitOps.removeWorktree({
					repoPath: project.repoPath,
					worktreePath: local.worktreePath,
					gitEnv: repoGitEnv,
				}));
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to verify worktree removal at ${local.worktreePath}: ${message}`,
				});
			}
			if (stillRegistered) {
				// git still tracks a live worktree here — removal genuinely
				// failed. Keep the local row so the workspace stays visible and
				// retryable instead of orphaning disk past the catalog commit point.
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to remove worktree at ${local.worktreePath}`,
				});
			}
			worktreeRemoved = true;
		}
	}

	// ─── Step 3: Local delete (authoritative) ─────────────────────
	// The local catalog row is the commit point and the only workspace record.
	deleteLocalWorkspace(
		{ db: ctx.db, eventBus: ctx.eventBus, catalog: ctx.catalog },
		input.workspaceId,
	);

	// ─── Step 4: Optional branch delete ────────────────────────────
	// After the local commit point so a failure here can't block the delete.
	if (repoGitEnv && project && local?.branch && input.deleteBranch) {
		try {
			await cleanupGitOps.deleteLocalBranch({
				repoPath: project.repoPath,
				branch: local.branch,
				gitEnv: repoGitEnv,
			});
			branchDeleted = true;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			warnings.push(`Failed to delete branch ${local.branch}: ${message}`);
		}
	}

	// ─── Step 5: Caches ────────────────────────────────────────────
	if (local) {
		try {
			invalidateLabelCache(input.workspaceId);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			warnings.push(`Failed to invalidate label cache: ${message}`);
		}
	}

	return {
		success: true,
		worktreeRemoved,
		branchDeleted,
		warnings,
	};
}
