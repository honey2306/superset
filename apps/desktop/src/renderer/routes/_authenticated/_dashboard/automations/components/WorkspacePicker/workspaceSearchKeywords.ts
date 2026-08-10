interface WorkspaceSearchable {
	branch: string | null;
}

/** Extra Command keywords for fields not represented by the item value. */
export function getWorkspaceSearchKeywords(
	workspace: WorkspaceSearchable,
): string[] {
	return workspace.branch ? [workspace.branch] : [];
}
