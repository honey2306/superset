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
	/**
	 * When present (production / tRPC ctx), every insert/update/delete is
	 * routed through the Catalog so identity + change journal stay
	 * transactional. Optional for narrow legacy call sites that still
	 * seed rows directly during tests.
	 */
	catalog?: WorkspaceCatalog;
}

/**
 * Cloud-row-compatible view of a local workspace row. Matches the shape of
 * `v2Workspace.getFromHost` / `create` responses so existing consumers of
 * cloud rows keep working when the host answers from its own table
 * (dual-write era; the cloud shape becomes the only shape in R3).
 */
export interface CloudShapedWorkspace {
	id: string;
	organizationId: string;
	projectId: string;
	hostId: string;
	name: string;
	branch: string;
	type: "main" | "worktree";
	createdByUserId: string | null;
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
		createdByUserId: row.createdByUserId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt || row.createdAt,
	};
}

export function toCloudShape(
	row: HostWorkspaceRow,
	organizationId: string,
): CloudShapedWorkspace {
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
		createdByUserId: row.createdByUserId,
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
	createdByUserId?: string | null;
}

/**
 * Insert a fully-populated local workspace row (host mints the id when the
 * caller didn't) and broadcast `workspace:changed`. When the store context
 * carries a Catalog, the insert AND its `catalog_changes` row commit in
 * one SQLite transaction; otherwise (legacy test callers) falls back to
 * the direct drizzle insert.
 */
export function insertLocalWorkspace(
	ctx: WorkspaceStoreContext,
	values: InsertLocalWorkspaceValues,
): HostWorkspaceRow {
	const now = Date.now();
	const id = values.id ?? randomUUID();
	let row: HostWorkspaceRow;
	if (ctx.catalog) {
		row = ctx.catalog.createWorkspace({
			id,
			projectId: values.projectId,
			worktreePath: values.worktreePath,
			branch: values.branch,
			name: values.name,
			type: values.type ?? "worktree",
			taskId: values.taskId ?? null,
			createdByUserId: values.createdByUserId ?? null,
		});
	} else {
		ctx.db
			.insert(workspaces)
			.values({
				id,
				projectId: values.projectId,
				worktreePath: values.worktreePath,
				branch: values.branch,
				name: values.name,
				type: values.type ?? "worktree",
				taskId: values.taskId ?? null,
				createdByUserId: values.createdByUserId ?? null,
				createdAt: now,
				updatedAt: now,
			})
			.run();
		const readback = getLocalWorkspace(ctx.db, id);
		if (!readback) throw new Error(`Workspace insert readback failed: ${id}`);
		row = readback;
	}
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
	let row: HostWorkspaceRow | undefined;
	if (ctx.catalog) {
		row = ctx.catalog.updateWorkspace(id, patch);
	} else {
		ctx.db
			.update(workspaces)
			.set({ ...patch, updatedAt: Date.now() })
			.where(eq(workspaces.id, id))
			.run();
		row = getLocalWorkspace(ctx.db, id);
	}
	if (row) emitWorkspaceChanged(ctx.eventBus, "updated", row);
	return row;
}

/** Delete a local row and broadcast. Idempotent. */
export function deleteLocalWorkspace(
	ctx: WorkspaceStoreContext,
	id: string,
): void {
	const existing = getLocalWorkspace(ctx.db, id);
	if (ctx.catalog) {
		ctx.catalog.deleteWorkspace(id);
	} else {
		ctx.db.delete(workspaces).where(eq(workspaces.id, id)).run();
	}
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
