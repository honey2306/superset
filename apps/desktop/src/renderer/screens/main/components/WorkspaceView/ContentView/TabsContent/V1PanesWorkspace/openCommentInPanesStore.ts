import type { WorkspaceStore } from "@superset/panes";
import type { CommentPaneState } from "shared/tabs-types";
import type { StoreApi } from "zustand/vanilla";
import type { V1PanesPaneData } from "./types";

/**
 * Open (or focus) a comment pane in a v1-panes store.
 *
 * Ports v1's `useTabsStore.openCommentPane` semantics onto the panes store:
 *
 * - If a `comment` pane already exists in any tab, update its `data.comment`
 *   in place and activate it (mirrors v1's "reuse existing comment pane"
 *   behavior — re-opening a PR review comment updates the body instead of
 *   opening a duplicate).
 * - Otherwise add a new tab holding one `comment` pane seeded with the
 *   comment payload (mirrors v1's `createCommentTabWithPane`).
 *
 * Pure with respect to the store: takes the store (via `StoreApi`) and the
 * comment payload, mutates only through the store's actions. Kept as a
 * standalone, injectable function so the v1 global tabs store can route a
 * `openCommentPane` call into the active workspace's panes store when
 * `V2_PANES_IN_V1` owns the view, without the v1 store importing the React
 * registry — the bridge layer (a module-level store registry) hands the
 * panes `StoreApi` to this function.
 */
export function openCommentInPanesStore(
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>,
	comment: CommentPaneState,
): void {
	const state = store.getState();

	// Reuse: find the first existing comment pane across all tabs.
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "comment") continue;
			const existing = pane.data;
			state.setPaneData({
				paneId: pane.id,
				data: { ...existing, comment },
			});
			state.setActiveTab(tab.id);
			state.setActivePane({ tabId: tab.id, paneId: pane.id });
			return;
		}
	}

	// None yet: open a fresh tab with one comment pane seeded from the payload.
	state.addTab({
		panes: [{ kind: "comment", data: { comment } }],
	});
}
