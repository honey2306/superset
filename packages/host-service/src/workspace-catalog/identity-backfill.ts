import { asc, eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, workspaces } from "../db/schema";
import { canonicalizeHostPath } from "./canonical-path";
import type { WorkspaceCatalog } from "./workspace-catalog";

/**
 * Fill the new canonical identity columns for legacy rows. Runs
 * synchronously at startup before tRPC accepts requests. On a unique
 * collision the losing row is left with `canonical_*_path = null` and a
 * conflict is recorded in `catalog_identity_conflicts`; nothing is merged
 * or deleted.
 */
export function runCatalogIdentityBackfill(deps: {
	db: HostDb;
	catalog: WorkspaceCatalog;
}): { projectsUpdated: number; workspacesUpdated: number; conflicts: number } {
	let projectsUpdated = 0;
	let workspacesUpdated = 0;
	let conflicts = 0;

	const projectRows = deps.db
		.select()
		.from(projects)
		.orderBy(asc(projects.createdAt), asc(projects.id))
		.all();
	const claimedProject = new Map<string, string>();
	for (const row of projectRows) {
		if (row.canonicalRepoPath) {
			claimedProject.set(row.canonicalRepoPath, row.id);
			continue;
		}
		const canonical = canonicalizeHostPath(row.repoPath);
		if (canonical.length === 0) continue;
		const previous = claimedProject.get(canonical);
		if (previous) {
			deps.catalog.recordIdentityConflict({
				entityType: "project",
				entityId: row.id,
				canonicalKey: canonical,
				conflictingId: previous,
				reason: "duplicate_canonical_repo_path",
			});
			conflicts++;
			continue;
		}
		try {
			deps.db
				.update(projects)
				.set({ canonicalRepoPath: canonical })
				.where(eq(projects.id, row.id))
				.run();
			claimedProject.set(canonical, row.id);
			projectsUpdated++;
		} catch (err) {
			if (err instanceof Error && /UNIQUE/i.test(err.message)) {
				deps.catalog.recordIdentityConflict({
					entityType: "project",
					entityId: row.id,
					canonicalKey: canonical,
					conflictingId: claimedProject.get(canonical) ?? "unknown",
					reason: "duplicate_canonical_repo_path",
				});
				conflicts++;
			} else throw err;
		}
	}

	const workspaceRows = deps.db
		.select()
		.from(workspaces)
		.orderBy(asc(workspaces.createdAt), asc(workspaces.id))
		.all();
	const claimedWorkspace = new Map<string, string>();
	for (const row of workspaceRows) {
		if (row.canonicalWorktreePath) {
			claimedWorkspace.set(row.canonicalWorktreePath, row.id);
			continue;
		}
		const canonical = canonicalizeHostPath(row.worktreePath);
		if (canonical.length === 0) continue;
		const previous = claimedWorkspace.get(canonical);
		if (previous) {
			deps.catalog.recordIdentityConflict({
				entityType: "workspace",
				entityId: row.id,
				canonicalKey: canonical,
				conflictingId: previous,
				reason: "duplicate_canonical_worktree_path",
			});
			conflicts++;
			continue;
		}
		try {
			deps.db
				.update(workspaces)
				.set({ canonicalWorktreePath: canonical })
				.where(eq(workspaces.id, row.id))
				.run();
			claimedWorkspace.set(canonical, row.id);
			workspacesUpdated++;
		} catch (err) {
			if (err instanceof Error && /UNIQUE/i.test(err.message)) {
				deps.catalog.recordIdentityConflict({
					entityType: "workspace",
					entityId: row.id,
					canonicalKey: canonical,
					conflictingId: claimedWorkspace.get(canonical) ?? "unknown",
					reason: "duplicate_canonical_worktree_path",
				});
				conflicts++;
			} else throw err;
		}
	}

	return { projectsUpdated, workspacesUpdated, conflicts };
}
