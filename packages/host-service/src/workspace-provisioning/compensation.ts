import { rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { workspaceOperationArtifacts } from "../db/schema";
import type { GitFactory } from "../runtime/git";

/**
 * Compensation — clean up filesystem/git artifacts a failed or cancelled
 * pre-commit operation created. Only touches rows with
 * `ownership='created'`; imported/adopted paths are never removed, even
 * on hard failure (execplan §Commit and compensation rules).
 *
 * `git-repo` root of the operation is passed in as `repoRoot` when a
 * worktree needs to be removed; PR branches are only removed when HEAD
 * still equals the journaled expected SHA.
 *
 * Returns per-kind counts + one of:
 *   - `complete`   → every artifact cleared or nothing to clear
 *   - `pending`    → compensation deliberately deferred (post-Catalog
 *     commit failures set this so the operation stays retryable)
 *   - `incomplete` → at least one artifact refused to clean up; the
 *     row is left with `cleanupState='incomplete'` for manual review
 */

export interface CompensationOutcome {
	state: "complete" | "pending" | "incomplete";
	cleared: number;
	skipped: number;
	failed: number;
}

export interface CompensationDeps {
	db: HostDb;
	git: GitFactory;
	/**
	 * Repo root used when removing a worktree or a PR branch. Optional —
	 * artifacts pinned by absolute path (repo-dir, worktree, terminal id)
	 * do not need it.
	 */
	repoRoot?: string;
}

export async function compensateOperation(
	deps: CompensationDeps,
	operationId: string,
): Promise<CompensationOutcome> {
	const artifacts = deps.db
		.select()
		.from(workspaceOperationArtifacts)
		.where(eq(workspaceOperationArtifacts.operationId, operationId))
		.all();
	if (artifacts.length === 0) {
		return { state: "complete", cleared: 0, skipped: 0, failed: 0 };
	}

	let cleared = 0;
	let skipped = 0;
	let failed = 0;

	for (const artifact of artifacts) {
		if (artifact.ownership !== "created") {
			skipped++;
			markArtifact(deps.db, artifact.id, "not-needed");
			continue;
		}
		try {
			await removeArtifact(deps, artifact);
			markArtifact(deps.db, artifact.id, "complete");
			cleared++;
		} catch (err) {
			console.warn(
				`[workspace-provisioning] compensation failed for ${artifact.kind}=${artifact.identity}:`,
				err,
			);
			markArtifact(deps.db, artifact.id, "incomplete");
			failed++;
		}
	}

	return {
		state: failed > 0 ? "incomplete" : "complete",
		cleared,
		skipped,
		failed,
	};
}

async function removeArtifact(
	deps: CompensationDeps,
	artifact: typeof workspaceOperationArtifacts.$inferSelect,
): Promise<void> {
	switch (artifact.kind) {
		case "repo-dir":
			rmSync(artifact.identity, { recursive: true, force: true });
			return;
		case "worktree": {
			if (!deps.repoRoot) {
				// Best-effort filesystem cleanup; skip git bookkeeping if we
				// don't know the owning repo.
				rmSync(artifact.identity, { recursive: true, force: true });
				return;
			}
			const git = await deps.git(deps.repoRoot);
			try {
				await git.raw(["worktree", "remove", "--force", artifact.identity]);
			} catch {
				// Fall back to filesystem removal + prune so a partially-added
				// worktree row still gets cleared.
				rmSync(artifact.identity, { recursive: true, force: true });
				await git.raw(["worktree", "prune"]).catch(() => {});
			}
			return;
		}
		case "branch": {
			if (!deps.repoRoot) return;
			const git = await deps.git(deps.repoRoot);
			// Only remove the branch when the journaled expected head still
			// matches what git shows for it — otherwise the branch has
			// diverged and we must not silently delete user work.
			if (artifact.expectedHeadSha) {
				const currentHead = await git
					.raw(["rev-parse", "--verify", `refs/heads/${artifact.identity}`])
					.catch(() => "");
				if (currentHead.trim() !== artifact.expectedHeadSha) {
					throw new Error(
						`Branch ${artifact.identity} diverged from journaled HEAD`,
					);
				}
			}
			await git.raw(["branch", "-D", artifact.identity]);
			return;
		}
		case "terminal":
			// Terminal spawns that happened post-commit are user-visible; the
			// execplan bans deleting them from compensation. Terminal cleanup
			// only applies to sessions created BEFORE an early failure, and
			// that's done inline by the runner today. Leave the artifact row
			// as `not-needed` so the report accounting stays honest.
			return;
	}
}

function markArtifact(
	db: HostDb,
	artifactId: string,
	state: "complete" | "incomplete" | "not-needed",
): void {
	db.update(workspaceOperationArtifacts)
		.set({ cleanupState: state, updatedAt: Date.now() })
		.where(eq(workspaceOperationArtifacts.id, artifactId))
		.run();
}
