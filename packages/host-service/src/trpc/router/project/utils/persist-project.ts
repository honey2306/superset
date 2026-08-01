import { basename } from "node:path";
import {
	emitProjectChanged,
	getLocalProject,
} from "../../../../projects/local-project-store";
import type { HostServiceContext } from "../../../../types";
import type { ResolvedRepo } from "./resolve-repo";

export interface ProjectIdentityFields {
	name?: string;
}

/**
 * Upsert the host-owned project row. Since M1 identity/display writes go
 * through the Workspace Catalog so the row insert and its
 * `catalog_changes` entry commit in one SQLite transaction. Existing
 * projects use `updateProject`; new ones use `createProject`.
 */
export function persistLocalProject(
	ctx: HostServiceContext,
	projectId: string,
	resolved: ResolvedRepo,
	identity?: ProjectIdentityFields,
): void {
	const existing = getLocalProject(ctx.db, projectId);
	const repoFields = {
		repoPath: resolved.repoPath,
		repoProvider: resolved.parsed ? ("github" as const) : null,
		repoOwner: resolved.parsed?.owner ?? null,
		repoName: resolved.parsed?.name ?? null,
		repoUrl: resolved.parsed?.url ?? null,
		remoteName: resolved.remoteName,
	};
	const name = identity?.name ?? existing?.name ?? basename(resolved.repoPath);

	if (existing) {
		ctx.catalog.updateProject(projectId, { ...repoFields, name });
	} else {
		ctx.catalog.createProject({
			id: projectId,
			...repoFields,
			name,
		});
	}
	const row = getLocalProject(ctx.db, projectId);
	if (row) {
		emitProjectChanged(ctx.eventBus, existing ? "updated" : "created", row);
	}
}
