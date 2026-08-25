import type { WorkspaceState } from "@superset/panes";
import type { PaneLifecycleRow } from "renderer/routes/_local/components/utils/paneLifecycleRows";
import type { LocalProductStateCollections } from "renderer/routes/_local/providers/LocalProductStateProvider/collections";

export interface SidebarWorkspaceRow {
	id: string;
	projectId: string;
	type: "main" | "worktree";
}

/**
 * Pure sidebar local-state mutations, kept free of React/Electron imports so
 * they can be unit-tested against an in-memory collection. Pane-runtime cleanup
 * is injected so the registry side effects stay in the hook layer.
 */

export function createEmptyPaneLayout(): WorkspaceState<unknown> {
	return {
		version: 1,
		tabs: [],
		activeTabId: null,
	} satisfies WorkspaceState<unknown>;
}

type CleanupPaneRuntimes = (rows: PaneLifecycleRow[]) => void;

/**
 * Hides a single workspace while keeping its project in the sidebar, by leaving
 * a hidden "tombstone" row rather than deleting it. A local `main` workspace
 * with no local-state row is re-surfaced by the gated auto-include path, so
 * hiding one requires a row (`isHidden: true`) to suppress it; a hard-delete
 * would let it reappear.
 */
export function tombstoneSidebarWorkspaceRecord(
	collections: Pick<LocalProductStateCollections, "workspaceLocalState">,
	workspaceId: string,
	projectId: string,
	cleanupPaneRuntimes: CleanupPaneRuntimes,
): void {
	const existing = collections.workspaceLocalState.get(workspaceId);
	if (!existing) {
		collections.workspaceLocalState.insert({
			workspaceId,
			createdAt: new Date(),
			sidebarState: {
				projectId,
				tabOrder: 0,
				sectionId: null,
				isHidden: true,
			},
			paneLayout: createEmptyPaneLayout(),
		});
		return;
	}

	cleanupPaneRuntimes([existing]);
	collections.workspaceLocalState.update(workspaceId, (draft) => {
		draft.sidebarState.projectId = projectId;
		draft.sidebarState.sectionId = null;
		draft.sidebarState.isHidden = true;
		draft.paneLayout = createEmptyPaneLayout();
	});
}

/**
 * Removes a project from the sidebar. Deleting its `sidebarProjects` row is
 * what hides it: membership is explicit and display gates on it
 * (`buildDashboardSidebarProjects` drops any workspace whose project is absent).
 *
 * Every catalog workspace is tombstoned so "removed" stays removed. The
 * reconciler places both `main` and `worktree` workspaces, so leaving a main
 * workspace row-less would immediately recreate the project row after this
 * mutation. Hiding existing rows as well as row-less catalog workspaces keeps
 * the dismissal stable without relying on effect timing. An explicit
 * `ensureWorkspaceInSidebar` call can still unhide the requested workspace
 * when the user intentionally adds it back.
 */
export function removeProjectFromSidebarState(
	collections: Pick<
		LocalProductStateCollections,
		"workspaceLocalState" | "sidebarSections" | "sidebarProjects"
	>,
	workspaces: SidebarWorkspaceRow[],
	projectId: string,
	cleanupPaneRuntimes: CleanupPaneRuntimes,
): void {
	const workspaceIds = new Set<string>();
	for (const row of collections.workspaceLocalState.state.values()) {
		if (row.sidebarState.projectId === projectId) {
			workspaceIds.add(row.workspaceId);
		}
	}
	for (const ws of workspaces) {
		if (ws.projectId === projectId) {
			workspaceIds.add(ws.id);
		}
	}

	for (const workspaceId of workspaceIds) {
		tombstoneSidebarWorkspaceRecord(
			collections,
			workspaceId,
			projectId,
			cleanupPaneRuntimes,
		);
	}

	const sectionIds = Array.from(collections.sidebarSections.state.values())
		.filter((item) => item.projectId === projectId)
		.map((item) => item.sectionId);
	if (sectionIds.length > 0) {
		collections.sidebarSections.delete(sectionIds);
	}

	if (collections.sidebarProjects.get(projectId)) {
		collections.sidebarProjects.delete(projectId);
	}
}
