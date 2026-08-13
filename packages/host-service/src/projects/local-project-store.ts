import { basename } from "node:path";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects } from "../db/schema";
import type { EventBus } from "../events";
import type { ProjectSnapshot } from "../events/types";
import type { WorkspaceCatalog } from "../workspace-catalog";

export type HostProjectRow = typeof projects.$inferSelect;

export interface ProjectStoreContext {
	db: HostDb;
	eventBus: EventBus;
	/** Production mutations must flow through the Catalog so the entity write
	 * and `catalog_changes` row commit together. Tests may still seed their
	 * databases directly before constructing this context.
	 */
	catalog: WorkspaceCatalog;
}

export function toProjectSnapshot(row: HostProjectRow): ProjectSnapshot {
	return {
		id: row.id,
		// Rows that predate local ownership have an empty name until the
		// backfill sweep fills it; the folder name is the honest fallback.
		name: row.name || basename(row.repoPath) || row.id,
		repoPath: row.repoPath,
		repoOwner: row.repoOwner,
		repoName: row.repoName,
		repoUrl: row.repoUrl,
		worktreeBaseDir: row.worktreeBaseDir,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt || row.createdAt,
	};
}

export function getLocalProject(
	db: HostDb,
	id: string,
): HostProjectRow | undefined {
	return db.query.projects.findFirst({ where: eq(projects.id, id) }).sync();
}

export function emitProjectChanged(
	eventBus: EventBus,
	eventType: "created" | "updated" | "deleted",
	rowOrId: HostProjectRow | string,
): void {
	const deleted = eventType === "deleted";
	eventBus.broadcastProjectChanged({
		projectId: typeof rowOrId === "string" ? rowOrId : rowOrId.id,
		eventType,
		project:
			deleted || typeof rowOrId === "string"
				? null
				: toProjectSnapshot(rowOrId),
		occurredAt: Date.now(),
	});
}

export interface UpdateLocalProjectPatch {
	name?: string;
}

/** Patch a local project row, bump `updatedAt`, and broadcast. */
export function updateLocalProject(
	ctx: ProjectStoreContext,
	id: string,
	patch: UpdateLocalProjectPatch,
): HostProjectRow | undefined {
	const existing = getLocalProject(ctx.db, id);
	if (!existing) return undefined;
	const row = ctx.catalog.updateProject(id, patch);
	if (!row) return undefined;
	emitProjectChanged(ctx.eventBus, "updated", row);
	return row;
}
