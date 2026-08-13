import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { BranchPrefixMode } from "@superset/shared/workspace-launch";
import { asc, count, desc, eq, gt } from "drizzle-orm";
import type { HostDb } from "../db";
import {
	catalogChanges,
	catalogIdentityConflicts,
	projects,
	workspaces,
} from "../db/schema";
import type { EventBus } from "../events";
import { canonicalizeHostPath } from "./canonical-path";
import {
	type CatalogEntityType,
	type CatalogEventType,
	CHANGES_PAGE_DEFAULT_LIMIT,
	CHANGES_PAGE_MAX_LIMIT,
	type ProjectSnapshotShape,
	type WorkspaceCatalogChange,
	type WorkspaceCatalogChangePage,
	type WorkspaceCatalogSnapshot,
	type WorkspaceSnapshotShape,
} from "./types";

type ProjectRow = typeof projects.$inferSelect;
type WorkspaceRow = typeof workspaces.$inferSelect;

export interface WorkspaceCatalogDeps {
	db: HostDb;
	eventBus: EventBus | null;
}

export interface ProjectWriteInput {
	id?: string;
	kind?: "repository" | "temporary";
	singletonKey?: string | null;
	repoPath: string;
	repoProvider?: string | null;
	repoOwner?: string | null;
	repoName?: string | null;
	repoUrl?: string | null;
	remoteName?: string | null;
	worktreeBaseDir?: string | null;
	branchPrefixMode?: BranchPrefixMode | null;
	branchPrefixCustom?: string | null;
	name?: string;
}

export interface ProjectPatch {
	kind?: "repository" | "temporary";
	singletonKey?: string | null;
	name?: string;
	repoPath?: string;
	repoProvider?: string | null;
	repoOwner?: string | null;
	repoName?: string | null;
	repoUrl?: string | null;
	remoteName?: string | null;
	worktreeBaseDir?: string | null;
	branchPrefixMode?: BranchPrefixMode | null;
	branchPrefixCustom?: string | null;
}

export interface WorkspaceWriteInput {
	id?: string;
	projectId: string;
	worktreePath: string;
	branch: string;
	name?: string;
	type?: "main" | "worktree";
	taskId?: string | null;
	headSha?: string | null;
	upstreamOwner?: string | null;
	upstreamRepo?: string | null;
	upstreamBranch?: string | null;
	pullRequestId?: string | null;
}

export interface WorkspacePatch {
	name?: string;
	branch?: string;
	worktreePath?: string;
	type?: "main" | "worktree";
	taskId?: string | null;
	headSha?: string | null;
	upstreamOwner?: string | null;
	upstreamRepo?: string | null;
	upstreamBranch?: string | null;
	pullRequestId?: string | null;
}

type CatalogTx = Parameters<Parameters<HostDb["transaction"]>[0]>[0];

/**
 * Workspace Catalog Module — the sole normal writer of Project/Workspace
 * identity and display columns. Every entity write and its
 * `catalog_changes` row happen in one SQLite transaction, then the
 * `catalog:changed` broadcast fires. A crash after commit but before
 * broadcast is healed by `snapshot`/`changes` on the next client call.
 *
 * Errors that would violate a canonical identity uniqueness constraint
 * are lifted to structured `CatalogIdentityConflictError`s so callers
 * (Provisioning, tests, backfills) can decide whether to record a conflict
 * or return `IDENTITY_CONFLICT` to the user.
 */
export class WorkspaceCatalog {
	constructor(private readonly deps: WorkspaceCatalogDeps) {}

	// ── Project writes ────────────────────────────────────────────────

	createProject(input: ProjectWriteInput): ProjectRow {
		const now = Date.now();
		const id = input.id ?? randomUUID();
		const canonical = canonicalizeHostPath(input.repoPath);
		const row: ProjectRow = this.deps.db.transaction((tx) => {
			try {
				tx.insert(projects)
					.values({
						id,
						repoPath: input.repoPath,
						repoProvider: input.repoProvider ?? null,
						repoOwner: input.repoOwner ?? null,
						repoName: input.repoName ?? null,
						repoUrl: input.repoUrl ?? null,
						remoteName: input.remoteName ?? null,
						worktreeBaseDir: input.worktreeBaseDir ?? null,
						branchPrefixMode: input.branchPrefixMode ?? null,
						branchPrefixCustom: input.branchPrefixCustom ?? null,
						name: input.name ?? "",
						kind: input.kind ?? "repository",
						singletonKey: input.singletonKey ?? null,
						canonicalRepoPath: canonical,
						createdAt: now,
						updatedAt: now,
					})
					.run();
			} catch (err) {
				throw wrapUniqueError(err, "project", id, canonical);
			}
			const inserted = tx
				.select()
				.from(projects)
				.where(eq(projects.id, id))
				.get();
			if (!inserted) {
				throw new Error(`Catalog project insert readback failed: ${id}`);
			}
			writeChange(
				tx,
				"project",
				id,
				"created",
				toProjectSnapshot(inserted),
				now,
			);
			return inserted;
		});
		this.wake();
		return row;
	}

	updateProject(id: string, patch: ProjectPatch): ProjectRow | undefined {
		const now = Date.now();
		const updated = this.deps.db.transaction((tx) => {
			const existing = tx
				.select()
				.from(projects)
				.where(eq(projects.id, id))
				.get();
			if (!existing) return undefined;
			const nextRepoPath = patch.repoPath ?? existing.repoPath;
			const canonical = canonicalizeHostPath(nextRepoPath);
			try {
				tx.update(projects)
					.set({
						...patch,
						canonicalRepoPath: canonical,
						updatedAt: now,
					})
					.where(eq(projects.id, id))
					.run();
			} catch (err) {
				throw wrapUniqueError(err, "project", id, canonical);
			}
			const row = tx.select().from(projects).where(eq(projects.id, id)).get();
			if (!row) return undefined;
			writeChange(tx, "project", id, "updated", toProjectSnapshot(row), now);
			return row;
		});
		if (updated) this.wake();
		return updated;
	}

	deleteProject(id: string): void {
		const now = Date.now();
		const didWork = this.deps.db.transaction((tx) => {
			const existing = tx
				.select()
				.from(projects)
				.where(eq(projects.id, id))
				.get();
			if (!existing) return false;
			// Cascade order: children first (stable id order), then the
			// project. The single transaction guarantees exactly one
			// broadcast wake will follow.
			const kids = tx
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, id))
				.orderBy(asc(workspaces.id))
				.all();
			for (const kid of kids) {
				writeChange(tx, "workspace", kid.id, "deleted", null, now);
			}
			tx.delete(projects).where(eq(projects.id, id)).run();
			writeChange(tx, "project", id, "deleted", null, now);
			return true;
		});
		if (didWork) this.wake();
	}

	// ── Workspace writes ──────────────────────────────────────────────

	createWorkspace(input: WorkspaceWriteInput): WorkspaceRow {
		const now = Date.now();
		const id = input.id ?? randomUUID();
		const canonical = canonicalizeHostPath(input.worktreePath);
		const row = this.deps.db.transaction((tx) => {
			try {
				tx.insert(workspaces)
					.values({
						id,
						projectId: input.projectId,
						worktreePath: input.worktreePath,
						branch: input.branch,
						name: input.name ?? input.branch,
						type: input.type ?? "worktree",
						taskId: input.taskId ?? null,
						headSha: input.headSha ?? null,
						upstreamOwner: input.upstreamOwner ?? null,
						upstreamRepo: input.upstreamRepo ?? null,
						upstreamBranch: input.upstreamBranch ?? null,
						pullRequestId: input.pullRequestId ?? null,
						canonicalWorktreePath: canonical,
						createdAt: now,
						updatedAt: now,
					})
					.run();
			} catch (err) {
				throw wrapUniqueError(err, "workspace", id, canonical);
			}
			const inserted = tx
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, id))
				.get();
			if (!inserted) {
				throw new Error(`Catalog workspace insert readback failed: ${id}`);
			}
			writeChange(
				tx,
				"workspace",
				id,
				"created",
				toWorkspaceSnapshot(inserted),
				now,
			);
			return inserted;
		});
		this.wake();
		return row;
	}

	updateWorkspace(id: string, patch: WorkspacePatch): WorkspaceRow | undefined {
		const now = Date.now();
		const updated = this.deps.db.transaction((tx) => {
			const existing = tx
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, id))
				.get();
			if (!existing) return undefined;
			const nextPath = patch.worktreePath ?? existing.worktreePath;
			const canonical = canonicalizeHostPath(nextPath);
			try {
				tx.update(workspaces)
					.set({
						...patch,
						canonicalWorktreePath: canonical,
						updatedAt: now,
					})
					.where(eq(workspaces.id, id))
					.run();
			} catch (err) {
				throw wrapUniqueError(err, "workspace", id, canonical);
			}
			const row = tx
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, id))
				.get();
			if (!row) return undefined;
			writeChange(
				tx,
				"workspace",
				id,
				"updated",
				toWorkspaceSnapshot(row),
				now,
			);
			return row;
		});
		if (updated) this.wake();
		return updated;
	}

	deleteWorkspace(id: string): void {
		const now = Date.now();
		const didWork = this.deps.db.transaction((tx) => {
			const existing = tx
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, id))
				.get();
			if (!existing) return false;
			tx.delete(workspaces).where(eq(workspaces.id, id)).run();
			writeChange(tx, "workspace", id, "deleted", null, now);
			return true;
		});
		if (didWork) this.wake();
	}

	// ── Queries ───────────────────────────────────────────────────────

	snapshot(): WorkspaceCatalogSnapshot {
		return this.deps.db.transaction((tx) => {
			const rev = tx
				.select({ v: desc(catalogChanges.revision) })
				.from(catalogChanges)
				.orderBy(desc(catalogChanges.revision))
				.limit(1)
				.get();
			const highest =
				rev && typeof (rev as { v?: unknown }).v === "number"
					? ((rev as { v: number }).v as number)
					: (tx
							.select({ max: catalogChanges.revision })
							.from(catalogChanges)
							.orderBy(desc(catalogChanges.revision))
							.limit(1)
							.get()?.max ?? 0);
			const projectRows = tx
				.select()
				.from(projects)
				.orderBy(asc(projects.createdAt), asc(projects.id))
				.all();
			const workspaceRows = tx
				.select()
				.from(workspaces)
				.orderBy(asc(workspaces.createdAt), asc(workspaces.id))
				.all();
			const conflictsRow = tx
				.select({ n: count() })
				.from(catalogIdentityConflicts)
				.get();
			const unresolvedIdentityConflicts = conflictsRow?.n ?? 0;
			return {
				schemaVersion: 1,
				revision: highest,
				projects: projectRows.map(toProjectSnapshot),
				workspaces: workspaceRows.map(toWorkspaceSnapshot),
				health: { unresolvedIdentityConflicts },
			};
		});
	}

	changes(afterRevision: number, limit?: number): WorkspaceCatalogChangePage {
		const bounded = Math.max(
			1,
			Math.min(limit ?? CHANGES_PAGE_DEFAULT_LIMIT, CHANGES_PAGE_MAX_LIMIT),
		);
		const rows = this.deps.db
			.select()
			.from(catalogChanges)
			.where(gt(catalogChanges.revision, afterRevision))
			.orderBy(asc(catalogChanges.revision))
			.limit(bounded + 1)
			.all();

		const hasMore = rows.length > bounded;
		const changes = rows
			.slice(0, bounded)
			.map<WorkspaceCatalogChange>((row) => ({
				schemaVersion: 1,
				revision: row.revision,
				entityType: row.entityType,
				entityId: row.entityId,
				eventType: row.eventType,
				snapshot: row.snapshotJson
					? (JSON.parse(row.snapshotJson) as
							| ProjectSnapshotShape
							| WorkspaceSnapshotShape)
					: null,
				occurredAt: row.occurredAt,
			}));

		const nextRevision =
			changes.length > 0
				? (changes[changes.length - 1]?.revision ?? afterRevision)
				: afterRevision;

		return { changes, nextRevision, hasMore };
	}

	// ── Identity-conflict bookkeeping ─────────────────────────────────

	recordIdentityConflict(args: {
		entityType: CatalogEntityType;
		entityId: string;
		canonicalKey: string;
		conflictingId: string;
		reason: string;
	}): void {
		const now = Date.now();
		this.deps.db
			.insert(catalogIdentityConflicts)
			.values({
				id: randomUUID(),
				entityType: args.entityType,
				entityId: args.entityId,
				canonicalKey: args.canonicalKey,
				conflictingId: args.conflictingId,
				reason: args.reason,
				detectedAt: now,
				resolvedAt: null,
			})
			.onConflictDoNothing()
			.run();
	}

	private wake(): void {
		if (!this.deps.eventBus) return;
		const latest = this.deps.db
			.select({ v: catalogChanges.revision })
			.from(catalogChanges)
			.orderBy(desc(catalogChanges.revision))
			.limit(1)
			.get();
		if (latest && typeof latest.v === "number") {
			this.deps.eventBus.broadcastCatalogChanged(latest.v);
		}
	}
}

export class CatalogIdentityConflictError extends Error {
	constructor(
		public readonly entityType: CatalogEntityType,
		public readonly entityId: string,
		public readonly canonicalKey: string,
	) {
		super(
			`Catalog identity conflict for ${entityType} ${entityId}: canonical key ${canonicalKey} already claimed`,
		);
		this.name = "CatalogIdentityConflictError";
	}
}

function wrapUniqueError(
	err: unknown,
	entityType: CatalogEntityType,
	entityId: string,
	canonicalKey: string,
): Error {
	if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
		return new CatalogIdentityConflictError(entityType, entityId, canonicalKey);
	}
	return err instanceof Error ? err : new Error(String(err));
}

function writeChange(
	tx: CatalogTx,
	entityType: CatalogEntityType,
	entityId: string,
	eventType: CatalogEventType,
	snapshot: ProjectSnapshotShape | WorkspaceSnapshotShape | null,
	occurredAt: number,
): void {
	tx.insert(catalogChanges)
		.values({
			schemaVersion: 1,
			entityType,
			entityId,
			eventType,
			snapshotJson: snapshot ? JSON.stringify(snapshot) : null,
			occurredAt,
		})
		.run();
}

export function toProjectSnapshot(row: ProjectRow): ProjectSnapshotShape {
	return {
		id: row.id,
		kind: (row.kind as "repository" | "temporary") ?? "repository",
		singletonKey: row.singletonKey ?? null,
		name: row.name || basename(row.repoPath) || row.id,
		repoPath: row.repoPath,
		repoProvider: row.repoProvider,
		repoOwner: row.repoOwner,
		repoName: row.repoName,
		repoUrl: row.repoUrl,
		remoteName: row.remoteName,
		worktreeBaseDir: row.worktreeBaseDir,
		branchPrefixMode:
			(row.branchPrefixMode as ProjectSnapshotShape["branchPrefixMode"]) ??
			null,
		branchPrefixCustom: row.branchPrefixCustom,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt || row.createdAt,
	};
}

export function toWorkspaceSnapshot(row: WorkspaceRow): WorkspaceSnapshotShape {
	return {
		id: row.id,
		projectId: row.projectId,
		name: row.name || row.branch,
		type: row.type,
		worktreePath: row.worktreePath,
		branch: row.branch,
		headSha: row.headSha,
		upstreamOwner: row.upstreamOwner,
		upstreamRepo: row.upstreamRepo,
		upstreamBranch: row.upstreamBranch,
		pullRequestId: row.pullRequestId,
		taskId: row.taskId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt || row.createdAt,
	};
}
