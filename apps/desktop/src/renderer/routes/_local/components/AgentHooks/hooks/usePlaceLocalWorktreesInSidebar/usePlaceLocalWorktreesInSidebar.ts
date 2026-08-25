import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo } from "react";
import { selectWorkspacesToPlace } from "renderer/routes/_local/components/AgentHooks/hooks/usePlaceLocalWorktreesInSidebar/selectWorkspacesToPlace";
import { useDashboardSidebarState } from "renderer/routes/_local/hooks/useDashboardSidebarState";
import { useLocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";

/**
 * Reconciles every catalog workspace into the sidebar once both the catalog
 * and local-state collections are ready. This makes workspaces created by the
 * renderer, CLI, or automation equally discoverable without waiting for the
 * workspace to become active first.
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

	const { isReady: localStateReady } = useLiveQuery(
		(query) => query.from({ state: collections.workspaceLocalState }),
		[collections],
	);

	useEffect(() => {
		if (!workspacesReady || !localStateReady) return;

		for (const workspace of selectWorkspacesToPlace(localWorkspaces)) {
			ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
		}
	}, [
		ensureWorkspaceInSidebar,
		localStateReady,
		localWorkspaces,
		workspacesReady,
	]);
}
