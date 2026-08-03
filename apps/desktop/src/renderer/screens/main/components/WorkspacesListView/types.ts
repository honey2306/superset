export interface WorkspaceItem {
	// Unique identifier - either workspace id or a synthetic worktree key
	uniqueId: string;
	// Populated for Catalog workspaces; null for orphan worktrees (no
	// active workspace on this host).
	workspaceId: string | null;
	projectId: string;
	projectName: string;
	worktreePath: string;
	type: "worktree" | "branch";
	branch: string;
	name: string;
	lastOpenedAt: number;
	createdAt: number;
	isUnread: boolean;
	isOpen: boolean;
}

export interface ProjectGroup {
	projectId: string;
	projectName: string;
	workspaces: WorkspaceItem[];
}

export type FilterMode = "all" | "active" | "closed";
