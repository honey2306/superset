import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { PaneViewerData } from "../../types";

const EMPTY_STATE: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

/**
 * The chat pane kind was removed. Drop any persisted chat panes from a
 * hydrated layout so they don't reappear as dead "Unknown pane kind: chat"
 * panes. Tabs left with no panes are dropped; the active tab id is cleared if
 * it no longer exists.
 */
function stripChatPanes(
	state: WorkspaceState<PaneViewerData>,
): WorkspaceState<PaneViewerData> {
	let changed = false;
	const tabs = state.tabs
		.map((tab) => {
			const paneEntries = Object.entries(tab.panes);
			if (!paneEntries.some(([, pane]) => pane.kind === "chat")) return tab;
			changed = true;
			const nextPanes = Object.fromEntries(
				paneEntries.filter(([, pane]) => pane.kind !== "chat"),
			);
			return { ...tab, panes: nextPanes };
		})
		.filter((tab) => Object.keys(tab.panes).length > 0);
	if (!changed) return state;
	const activeTabId =
		state.activeTabId && tabs.some((t) => t.id === state.activeTabId)
			? state.activeTabId
			: null;
	return { ...state, tabs, activeTabId };
}

function getSnapshot(state: WorkspaceState<PaneViewerData>): string {
	return JSON.stringify(state);
}

export function useV2WorkspacePaneLayout() {
	const { workspace } = useWorkspace();
	const workspaceId = workspace.id;
	const collections = useCollections();
	// Keep the volatile pane store scoped to the route workspace. During fast
	// workspace switches, live queries can briefly return stale rows; sharing
	// the same store across that boundary lets panes from one worktree render
	// and persist under another.
	const workspaceRuntime = useMemo(
		() => ({
			workspaceId,
			store: createWorkspaceStore<PaneViewerData>({
				initialState: EMPTY_STATE,
			}),
		}),
		[workspaceId],
	);
	const { store } = workspaceRuntime;
	const syncStateRef = useRef({
		workspaceId,
		lastSyncedSnapshot: getSnapshot(EMPTY_STATE),
	});

	const { data: localWorkspaceRows = [], isReady: isLayoutReady } =
		useLiveQuery(
			(query) =>
				query
					.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
					.where(({ v2WorkspaceLocalState }) =>
						eq(v2WorkspaceLocalState.workspaceId, workspaceId),
					),
			[collections, workspaceId],
		);
	const localWorkspaceState =
		localWorkspaceRows.find((row) => row.workspaceId === workspaceId) ?? null;
	const persistedPaneLayout = useMemo(
		() =>
			localWorkspaceState?.workspaceId === workspaceId
				? stripChatPanes(
						(localWorkspaceState.paneLayout as
							| WorkspaceState<PaneViewerData>
							| undefined) ?? EMPTY_STATE,
					)
				: EMPTY_STATE,
		[localWorkspaceState, workspaceId],
	);

	useEffect(() => {
		syncStateRef.current = {
			workspaceId,
			lastSyncedSnapshot: getSnapshot(EMPTY_STATE),
		};
	}, [workspaceId]);

	useEffect(() => {
		const nextSnapshot = getSnapshot(persistedPaneLayout);
		if (nextSnapshot === syncStateRef.current.lastSyncedSnapshot) {
			return;
		}

		syncStateRef.current.lastSyncedSnapshot = nextSnapshot;
		store.getState().replaceState(persistedPaneLayout);
	}, [persistedPaneLayout, store]);

	useEffect(() => {
		const unsubscribe = store.subscribe((nextStore) => {
			const nextWorkspaceState: WorkspaceState<PaneViewerData> = {
				version: nextStore.version,
				tabs: nextStore.tabs,
				activeTabId: nextStore.activeTabId,
			};
			const nextSnapshot = getSnapshot(nextWorkspaceState);
			if (nextSnapshot === syncStateRef.current.lastSyncedSnapshot) {
				return;
			}

			if (!collections.v2WorkspaceLocalState.get(workspaceId)) {
				return;
			}

			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.paneLayout = nextWorkspaceState;
			});
			syncStateRef.current.lastSyncedSnapshot = nextSnapshot;
		});

		return () => {
			unsubscribe();
		};
	}, [collections, store, workspaceId]);

	return { store, isLayoutReady };
}
