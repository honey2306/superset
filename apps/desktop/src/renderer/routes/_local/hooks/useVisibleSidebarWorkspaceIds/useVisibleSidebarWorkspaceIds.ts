import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useLocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider";
import {
	getSidebarWorkspaceIsHidden,
	isAutoIncludedLocalMainWorkspace,
} from "renderer/routes/_local/providers/LocalProductStateProvider/dashboardSidebarLocal";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";

/**
 * The set of workspace ids that actually appear in the user's v2 dashboard
 * sidebar. This is the per-user, per-org "my workspaces" view: explicitly
 * placed (and not hidden) workspaces plus auto-included local `main`
 * workspaces, both gated on the projects the user added to their sidebar.
 *
 * Notifications and ports filter against this so a user is never bothered by a
 * workspace that is present in the local catalog but not placed locally.
 */
export function useVisibleSidebarWorkspaceIds(): Set<string> {
	const collections = useLocalCollections();

	// Placement rows joined against live host-served projects (projects are
	// fully local; the old inner join against the cloud collection is gone).
	const { data: sidebarPlacementRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarProjects: collections.sidebarProjects })
				.select(({ sidebarProjects }) => ({
					projectId: sidebarProjects.projectId,
				})),
		[collections],
	);
	const { projects: hostProjects } = useWorkspaceCatalog();
	const sidebarProjects = useMemo(() => {
		const known = new Set(hostProjects.map((project) => project.id));
		return sidebarPlacementRows.filter((row) => known.has(row.projectId));
	}, [sidebarPlacementRows, hostProjects]);

	const { data: localStateRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarWorkspaces: collections.workspaceLocalState })
				.select(({ sidebarWorkspaces }) => ({
					id: sidebarWorkspaces.workspaceId,
					projectId: sidebarWorkspaces.sidebarState.projectId,
					isHidden: sidebarWorkspaces.sidebarState.isHidden,
				})),
		[collections],
	);

	const { workspaces: hostWorkspaces } = useWorkspaceCatalog();

	return useMemo(() => {
		const workspaceIds = new Set(
			hostWorkspaces.map((workspace) => workspace.id),
		);
		// Local-state rows only count when the workspace still exists (the old
		// query inner-joined against the workspaces table for the same reason).
		const localStateWorkspaces = localStateRows.filter((workspace) =>
			workspaceIds.has(workspace.id),
		);
		const sidebarProjectIds = new Set(
			sidebarProjects.map((project) => project.projectId),
		);
		const localStateWorkspaceIds = new Set(
			localStateWorkspaces.map((workspace) => workspace.id),
		);
		const visibleIds = new Set<string>();

		for (const workspace of localStateWorkspaces) {
			if (getSidebarWorkspaceIsHidden(workspace)) continue;
			if (!sidebarProjectIds.has(workspace.projectId)) continue;
			visibleIds.add(workspace.id);
		}

		for (const workspace of hostWorkspaces) {
			if (workspace.type !== "main") continue;
			if (
				isAutoIncludedLocalMainWorkspace(workspace, {
					localStateWorkspaceIds,
					sidebarProjectIds,
				})
			) {
				visibleIds.add(workspace.id);
			}
		}

		return visibleIds;
	}, [sidebarProjects, localStateRows, hostWorkspaces]);
}
