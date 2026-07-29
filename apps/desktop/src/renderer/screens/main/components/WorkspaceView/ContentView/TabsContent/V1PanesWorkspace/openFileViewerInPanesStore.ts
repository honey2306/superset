import type { WorkspaceStore } from "@superset/panes";
import type { AddFileViewerPaneOptions } from "renderer/stores/tabs/types";
import { createFileViewerPane } from "renderer/stores/tabs/utils";
import type { StoreApi } from "zustand/vanilla";
import type { V1PanesPaneData } from "./types";

/**
 * Routes v1 file-open requests into the active panes store.
 *
 * This preserves the useful preview behavior (an unpinned matching file pane
 * is updated and focused) while avoiding writes to the hidden mosaic layout
 * when `V2_PANES_IN_V1` owns the workspace view.
 */
export function openFileViewerInPanesStore(
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>,
	options: AddFileViewerPaneOptions,
): string {
	const state = store.getState();
	const fileViewer = createFileViewerPane("panes", options).fileViewer;
	if (!fileViewer) {
		throw new Error("Failed to create file viewer state");
	}
	const reuseExisting = options.reuseExisting ?? "workspace";

	if (reuseExisting !== "none") {
		const tabs =
			reuseExisting === "active-tab"
				? [state.getActiveTab()].filter((tab) => tab !== null)
				: state.tabs;
		for (const tab of tabs) {
			for (const pane of Object.values(tab.panes)) {
				const existing = pane.data.fileViewer;
				if (
					pane.kind !== "file-viewer" ||
					!existing ||
					existing.isPinned ||
					existing.filePath !== fileViewer.filePath ||
					existing.diffCategory !== fileViewer.diffCategory ||
					existing.commitHash !== fileViewer.commitHash
				)
					continue;
				state.setPaneData({
					paneId: pane.id,
					data: { ...pane.data, fileViewer },
				});
				state.setActiveTab(tab.id);
				state.setActivePane({ tabId: tab.id, paneId: pane.id });
				return pane.id;
			}
		}
	}

	const paneId = crypto.randomUUID();
	const newPane = { id: paneId, kind: "file-viewer", data: { fileViewer } };
	const activeTab = state.getActiveTab();
	if (!activeTab || options.openInNewTab) {
		state.addTab({ panes: [newPane] });
		return paneId;
	}

	const sourcePane = state.getActivePane(activeTab.id)?.pane;
	if (!sourcePane) {
		state.addTab({ panes: [newPane] });
		return paneId;
	}
	state.splitPane({
		tabId: activeTab.id,
		paneId: sourcePane.id,
		position: "right",
		newPane,
	});
	return paneId;
}
