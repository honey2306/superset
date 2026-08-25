export type LocalWorkspaceForPlacement = {
	id: string;
	projectId: string;
	type: "main" | "worktree";
};

/**
 * Chooses which catalog workspaces the sidebar reconciler should place.
 * Every catalog row is eligible: the sidebar is the workspace inventory, so
 * an ambient main workspace and a worktree created outside the renderer are
 * equally discoverable. Kept free of React so it can be unit-tested directly.
 */
export function selectWorkspacesToPlace(
	localWorkspaces: readonly LocalWorkspaceForPlacement[],
): Array<{ id: string; projectId: string }> {
	return localWorkspaces.map(({ id, projectId }) => ({ id, projectId }));
}
