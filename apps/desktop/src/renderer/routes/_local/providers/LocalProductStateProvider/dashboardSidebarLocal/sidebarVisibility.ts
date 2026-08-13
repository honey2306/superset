type SidebarWorkspaceVisibilitySource =
	| { isHidden?: boolean | null }
	| { sidebarState: { isHidden?: boolean | null } };

export function getSidebarWorkspaceIsHidden(
	workspace: SidebarWorkspaceVisibilitySource,
): boolean {
	if ("sidebarState" in workspace) {
		return workspace.sidebarState.isHidden === true;
	}
	return workspace.isHidden === true;
}

export function isSidebarWorkspaceVisible(
	workspace: SidebarWorkspaceVisibilitySource,
): boolean {
	return !getSidebarWorkspaceIsHidden(workspace);
}

export function getVisibleSidebarWorkspaces<
	Workspace extends SidebarWorkspaceVisibilitySource,
>(workspaces: readonly Workspace[]): Workspace[] {
	return workspaces.filter(isSidebarWorkspaceVisible);
}

/**
 * A `main` workspace is auto-included in the sidebar when the user hasn't
 * explicitly placed it (no local-state row), and its project is one the user
 * added to their sidebar. Catalog rows are always owned by this machine. Shared by the sidebar tree
 * builder and the notification/ports visibility filters so they agree on what
 * "in the sidebar" means.
 */
export function isAutoIncludedLocalMainWorkspace(
	workspace: { id: string; projectId: string },
	{
		localStateWorkspaceIds,
		sidebarProjectIds,
	}: {
		localStateWorkspaceIds: ReadonlySet<string>;
		sidebarProjectIds: ReadonlySet<string>;
	},
): boolean {
	return (
		!localStateWorkspaceIds.has(workspace.id) &&
		sidebarProjectIds.has(workspace.projectId)
	);
}
