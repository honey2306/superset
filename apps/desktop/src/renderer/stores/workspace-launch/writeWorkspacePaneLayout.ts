import type { WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/lib/panes/pane-viewer-data";
import type { LocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider/collections";
import {
	getPrependTabOrder,
	isSidebarWorkspaceVisible,
} from "renderer/routes/_local/providers/LocalProductStateProvider/dashboardSidebarLocal";
import {
	appendLaunchesToPaneLayout,
	type WorkspacePaneAgentLaunch,
} from "./appendLaunchesToPaneLayout";

/**
 * Insert or update renderer-owned local state for a canonical Workspace and
 * fold host-launched sessions into its pane layout. This is deliberately
 * separate from Workspace identity persistence: callers must provide the
 * canonical ID returned by Provisioning or Catalog.
 */
export function writeWorkspacePaneLayout(
	collections: LocalCollections,
	workspace: { id: string; projectId: string; isUnnamed?: boolean },
	terminals: Array<{ terminalId: string; label?: string }>,
	agents: WorkspacePaneAgentLaunch[],
): void {
	const existing = collections.workspaceLocalState.get(workspace.id);
	const paneLayout = appendLaunchesToPaneLayout({
		existing: existing?.paneLayout as
			| WorkspaceState<PaneViewerData>
			| undefined,
		terminals,
		agents,
	});

	if (existing) {
		collections.workspaceLocalState.update(workspace.id, (draft) => {
			draft.paneLayout = paneLayout;
			if (workspace.isUnnamed !== undefined) {
				draft.isUnnamed = workspace.isUnnamed;
			}
		});
		return;
	}

	const topLevelItems = [
		...Array.from(collections.workspaceLocalState.state.values())
			.filter(
				(item) =>
					item.sidebarState.projectId === workspace.projectId &&
					item.sidebarState.sectionId === null &&
					isSidebarWorkspaceVisible(item),
			)
			.map((item) => ({ tabOrder: item.sidebarState.tabOrder })),
		...Array.from(collections.sidebarSections.state.values())
			.filter((item) => item.projectId === workspace.projectId)
			.map((item) => ({ tabOrder: item.tabOrder })),
	];
	collections.workspaceLocalState.insert({
		workspaceId: workspace.id,
		createdAt: new Date(),
		...(workspace.isUnnamed !== undefined
			? { isUnnamed: workspace.isUnnamed }
			: {}),
		sidebarState: {
			projectId: workspace.projectId,
			tabOrder: getPrependTabOrder(topLevelItems),
			sectionId: null,
			changesFilter: { kind: "all" },
			activeTab: "changes",
			isHidden: false,
		},
		paneLayout,
		viewedFiles: [],
		recentlyViewedFiles: [],
	});
}
