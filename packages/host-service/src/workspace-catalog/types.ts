/**
 * Wire types the Workspace Catalog Module exposes to tRPC and the event
 * bus. These are the projection contract: renderer and other clients see
 * only these shapes, never the drizzle-inferred row.
 */

export type CatalogEntityType = "project" | "workspace";
export type CatalogEventType = "created" | "updated" | "deleted";

export interface ProjectSnapshotShape {
	id: string;
	kind: "repository" | "temporary";
	singletonKey: string | null;
	name: string;
	repoPath: string;
	repoProvider: string | null;
	repoOwner: string | null;
	repoName: string | null;
	repoUrl: string | null;
	remoteName: string | null;
	worktreeBaseDir: string | null;
	branchPrefixMode: "none" | "github" | "author" | "custom" | null;
	branchPrefixCustom: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface WorkspaceSnapshotShape {
	id: string;
	projectId: string;
	name: string;
	type: "main" | "worktree";
	worktreePath: string;
	branch: string;
	headSha: string | null;
	upstreamOwner: string | null;
	upstreamRepo: string | null;
	upstreamBranch: string | null;
	pullRequestId: string | null;
	taskId: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface WorkspaceCatalogSnapshot {
	schemaVersion: 1;
	revision: number;
	projects: ProjectSnapshotShape[];
	workspaces: WorkspaceSnapshotShape[];
	health: { unresolvedIdentityConflicts: number };
}

export interface WorkspaceCatalogChange {
	schemaVersion: 1;
	revision: number;
	entityType: CatalogEntityType;
	entityId: string;
	eventType: CatalogEventType;
	snapshot: ProjectSnapshotShape | WorkspaceSnapshotShape | null;
	occurredAt: number;
}

export interface WorkspaceCatalogChangePage {
	changes: WorkspaceCatalogChange[];
	nextRevision: number;
	hasMore: boolean;
}

/** Cap chosen to match the execplan default (200) and hard maximum (500). */
export const CHANGES_PAGE_DEFAULT_LIMIT = 200;
export const CHANGES_PAGE_MAX_LIMIT = 500;
