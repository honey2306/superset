import { randomUUID } from "node:crypto";
import { getHostId } from "@superset/shared/host-info";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { workspaces } from "../db/schema";
import type { EventBus } from "../events";
import type { WorkspaceSnapshot } from "../events/types";
import type { WorkspaceCatalog } from "../workspace-catalog";

export type HostWorkspaceRow = typeof workspaces.$inferSelect;

export interface WorkspaceStoreContext {
	db: HostDb;
	eventBus: EventBus;
	/** Every production mutation is routed through the Catalog so identity and
	 * the change journal stay transactional. Tests may seed the DB directly
	 * before constructing this context.
	 */
	catalog: WorkspaceCatalog;
}

/** Public workspace view derived from the host-owned catalog row. */
export interface WorkspaceView {
	id: string;
	organizationId: string;
	projectId: string;
	hostId: string;
	name: string;
	branch: string;
	type: "main" | "worktree";
	taskId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export function toWorkspaceSnapshot(row: HostWorkspaceRow): WorkspaceSnapshot {
	return {
		id: row.id,
		projectId: row.projectId,
		name: row.name || row.branch,
		branch: row.branch,
		type: row.type,
		worktreePath: row.worktreePath,
		taskId: row.taskId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt || row.createdAt,
	};
}

export function toWorkspaceView(
	row: HostWorkspaceRow,
	organizationId: string,
): WorkspaceView {
	return {
		id: row.id,
		organizationId,
		projectId: row.projectId,
		hostId: getHostId(),
		// Rows that predate local ownership have an empty name until the
		// backfill sweep fills it; branch is the honest fallback.
		name: row.name || row.branch,
		branch: row.branch,
		type: row.type,
		taskId: row.taskId,
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt || row.createdAt),
	};
}

export function getLocalWorkspace(
	db: HostDb,
	id: string,
): HostWorkspaceRow | undefined {
	return db.query.workspaces.findFirst({ where: eq(workspaces.id, id) }).sync();
}

export interface InsertLocalWorkspaceValues {
	id?: string;
	projectId: string;
	worktreePath: string;
	branch: string;
	name: string;
	type?: "main" | "worktree";
	taskId?: string | null;
}

/**
 * Insert a fully-populated local workspace row (host mints the id when the
 * caller didn't) and broadcast `workspace:changed`. The insert and its
 * `catalog_changes` row commit in one SQLite transaction.
 */
export function insertLocalWorkspace(
	ctx: WorkspaceStoreContext,
	values: InsertLocalWorkspaceValues,
): HostWorkspaceRow {
	const id = values.id ?? randomUUID();
	const row = ctx.catalog.createWorkspace({
		id,
		projectId: values.projectId,
		worktreePath: values.worktreePath,
		branch: values.branch,
		name: values.name,
		type: values.type ?? "worktree",
		taskId: values.taskId ?? null,
	});
	emitWorkspaceChanged(ctx.eventBus, "created", row);
	return row;
}

export interface UpdateLocalWorkspacePatch {
	name?: string;
	branch?: string;
	worktreePath?: string;
	taskId?: string | null;
	projectId?: string;
}

/** Patch a local row, bump `updatedAt`, and broadcast. */
export function updateLocalWorkspace(
	ctx: WorkspaceStoreContext,
	id: string,
	patch: UpdateLocalWorkspacePatch,
): HostWorkspaceRow | undefined {
	const existing = getLocalWorkspace(ctx.db, id);
	if (!existing) return undefined;
	const row = ctx.catalog.updateWorkspace(id, patch);
	if (row) emitWorkspaceChanged(ctx.eventBus, "updated", row);
	return row;
}

/** Delete a local row and broadcast. Idempotent. */
export function deleteLocalWorkspace(
	ctx: WorkspaceStoreContext,
	id: string,
): void {
	const existing = getLocalWorkspace(ctx.db, id);
	ctx.catalog.deleteWorkspace(id);
	if (existing) {
		ctx.eventBus.broadcastWorkspaceChanged({
			workspaceId: id,
			eventType: "deleted",
			workspace: null,
			occurredAt: Date.now(),
		});
	}
}

function emitWorkspaceChanged(
	eventBus: EventBus,
	eventType: "created" | "updated",
	row: HostWorkspaceRow,
): void {
	eventBus.broadcastWorkspaceChanged({
		workspaceId: row.id,
		eventType,
		workspace: toWorkspaceSnapshot(row),
		occurredAt: Date.now(),
	});
}
