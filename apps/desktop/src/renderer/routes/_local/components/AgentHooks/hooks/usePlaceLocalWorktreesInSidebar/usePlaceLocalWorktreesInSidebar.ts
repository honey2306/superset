import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo } from "react";
import { useDashboardSidebarState } from "renderer/routes/_local/hooks/useDashboardSidebarState";
import { useLocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import { selectWorktreesToPlace } from "./selectWorktreesToPlace";

/**
 * Places deliberately-created worktrees into the sidebar exactly once.
 *
 * A `worktree` is always an explicit creation (renderer, CLI, or automation),
 * so it should surface even when created outside the renderer — the CLI and
 * automations go through the host service and can't write renderer-local
 * sidebar state. An ambient `main` workspace is excluded: the host creates one
 * for every project on the device, so placing those would drag every
 * locally-known project into the sidebar. Main workspaces surface only under a
 * project already in the sidebar (`isAutoIncludedLocalMainWorkspace`).
 *
 * "Placed once, then respected": a present `workspaceLocalState` row means
 * "already seen". Hiding a worktree keeps a hidden tombstone row, and removing
 * its project keeps the row while dropping the project record — so neither is
 * ever re-placed. Only a genuinely new (row-less) worktree is added.
 */
export function usePlaceLocalWorktreesInSidebar(): void {
	const collections = useLocalCollections();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();

	const { workspaces, isReady: workspacesReady } = useWorkspaceCatalog();
	const localWorkspaces = useMemo(
		() =>
			workspaces.map((workspace) => ({
				id: workspace.id,
				projectId: workspace.projectId,
				type: workspace.type,
			})),
		[workspaces],
	);

	const { data: localStateRows = [], isReady: localStateReady } = useLiveQuery(
		(query) =>
			query
				.from({ state: collections.workspaceLocalState })
				.select(({ state }) => ({ workspaceId: state.workspaceId })),
		[collections],
	);

	useEffect(() => {
		if (!workspacesReady || !localStateReady) return;

		const placedWorkspaceIds = new Set(
			localStateRows.map((row) => row.workspaceId),
		);

		for (const worktree of selectWorktreesToPlace(
			localWorkspaces,
			placedWorkspaceIds,
		)) {
			ensureWorkspaceInSidebar(worktree.id, worktree.projectId);
		}
	}, [
		ensureWorkspaceInSidebar,
		localStateReady,
		localStateRows,
		localWorkspaces,
		workspacesReady,
	]);
}
