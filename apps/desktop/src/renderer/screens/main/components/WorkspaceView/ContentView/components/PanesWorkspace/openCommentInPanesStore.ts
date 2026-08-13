import type { WorkspaceStore } from "@superset/panes";
import type { CommentPaneState } from "shared/tabs-types";
import type { StoreApi } from "zustand/vanilla";
import type { PanesPaneData } from "./types";

/**
 * Open (or focus) a comment pane in a panes store.
 *
 * Opens review comments directly in the workspace Panes store:
 *
 * - If a `comment` pane already exists in any tab, update its `data.comment`
 *   in place and activate it (mirrors v1's "reuse existing comment pane"
 *   behavior — re-opening a PR review comment updates the body instead of
 *   opening a duplicate).
 * - Otherwise add a new tab holding one `comment` pane seeded with the
 *   comment payload (mirrors v1's `createCommentTabWithPane`).
 *
 * Pure with respect to the injected workspace store.
 */
export function openCommentInPanesStore(
	store: StoreApi<WorkspaceStore<PanesPaneData>>,
	comment: CommentPaneState,
): { tabId: string; paneId: string } {
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
			return { tabId: tab.id, paneId: pane.id };
		}
	}

	// None yet: open a fresh tab with one comment pane seeded from the payload.
	state.addTab({
		panes: [{ kind: "comment", data: { comment } }],
	});
	const addedState = store.getState();
	const tab = addedState.tabs.find(
		(candidate) => candidate.id === addedState.activeTabId,
	);
	const pane = tab ? Object.values(tab.panes)[0] : undefined;
	if (!tab || !pane) {
		throw new Error("Comment pane was not created");
	}
	return { tabId: tab.id, paneId: pane.id };
}
