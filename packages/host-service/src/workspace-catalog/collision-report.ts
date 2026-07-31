import { asc } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, workspaces } from "../db/schema";

/**
 * M0 read-only identity-collision audit for the future Workspace Catalog.
 *
 * Groups current `projects.repoPath` and `workspaces.worktreePath` rows by
 * their canonical form and reports any bucket that ended up with more than
 * one row. The helper performs no mutation and touches no filesystem — it is
 * safe to call against an empty database or against paths that no longer
 * exist on disk.
 *
 * The canonicalization rule intentionally mirrors what M1 will use as the
 * per-host identity key: trim whitespace, strip a trailing separator (but
 * preserve a lone root `/`), and leave case alone (macOS and Linux disagree
 * on case-sensitivity of the underlying filesystem; case-insensitive
 * bucketing here would silently coalesce paths that git treats as distinct).
 */
export interface IdentityCollisionReport {
	duplicateRepoPaths: Array<{
		canonicalRepoPath: string;
		projectIds: string[];
	}>;
	duplicateWorktreePaths: Array<{
		canonicalWorktreePath: string;
		workspaceIds: string[];
	}>;
}

/**
 * Trim; drop a single trailing `/` or `\` unless the string reduces to a
 * root separator. No lowercasing, no fs `realpath` — collisions must be
 * detectable purely from what is already in the DB.
 */
export function canonicalizePath(rawPath: string): string {
	const trimmed = rawPath.trim();
	if (trimmed.length <= 1) return trimmed;
	const last = trimmed[trimmed.length - 1];
	if (last === "/" || last === "\\") {
		return trimmed.slice(0, -1);
	}
	return trimmed;
}

function groupDuplicates<T>(
	rows: Array<{ id: string; canonical: string }>,
	buildEntry: (canonical: string, ids: string[]) => T,
): T[] {
	const buckets = new Map<string, string[]>();
	for (const row of rows) {
		const existing = buckets.get(row.canonical);
		if (existing) {
			existing.push(row.id);
		} else {
			buckets.set(row.canonical, [row.id]);
		}
	}
	const duplicates: T[] = [];
	for (const [canonical, ids] of buckets) {
		if (ids.length > 1) {
			const sortedIds = [...ids].sort();
			duplicates.push(buildEntry(canonical, sortedIds));
		}
	}
	return duplicates;
}

export function generateIdentityCollisionReport(
	db: HostDb,
): IdentityCollisionReport {
	// Deterministic input order (createdAt asc, then id asc) so callers
	// eyeballing the raw insertion sequence get stable bucket ordering
	// before we sort ids lexicographically inside each bucket.
	const projectRows = db
		.select({ id: projects.id, repoPath: projects.repoPath })
		.from(projects)
		.orderBy(asc(projects.createdAt), asc(projects.id))
		.all();
	const workspaceRows = db
		.select({ id: workspaces.id, worktreePath: workspaces.worktreePath })
		.from(workspaces)
		.orderBy(asc(workspaces.createdAt), asc(workspaces.id))
		.all();

	const duplicateRepoPaths = groupDuplicates(
		projectRows.map((row) => ({
			id: row.id,
			canonical: canonicalizePath(row.repoPath),
		})),
		(canonicalRepoPath, projectIds) => ({ canonicalRepoPath, projectIds }),
	);

	const duplicateWorktreePaths = groupDuplicates(
		workspaceRows.map((row) => ({
			id: row.id,
			canonical: canonicalizePath(row.worktreePath),
		})),
		(canonicalWorktreePath, workspaceIds) => ({
			canonicalWorktreePath,
			workspaceIds,
		}),
	);

	return { duplicateRepoPaths, duplicateWorktreePaths };
}
