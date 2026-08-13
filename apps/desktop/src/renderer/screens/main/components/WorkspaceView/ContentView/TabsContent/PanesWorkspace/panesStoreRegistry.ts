import type { WorkspaceStore } from "@superset/panes";
import type { AddFileViewerPaneOptions } from "renderer/stores/tabs/types";
import type { CommentPaneState } from "shared/tabs-types";
import type { StoreApi } from "zustand/vanilla";
import { openCommentInPanesStore } from "./openCommentInPanesStore";
import { openFileViewerInPanesStore } from "./openFileViewerInPanesStore";
import type { PanesPaneData } from "./types";

/**
 * Active workspace Panes navigation service, keyed by workspace id.
 * Route, command palette, sidebar, ACP, and rename callers use this directly;
 * the legacy tabs store is not involved in workspace navigation.
 */
const panesStores = new Map<string, StoreApi<WorkspaceStore<PanesPaneData>>>();

/** Register a panes store for a workspace. Called by `PanesWorkspace`
 * on mount. Overwriting an existing entry for the same workspace id is a
 * no-op of intent: only one `PanesWorkspace` is mounted per workspace at
 * a time, so a second register would indicate a remount, and the new
 * store is the live one. */
export function registerPanesStore(
	workspaceId: string,
	store: StoreApi<WorkspaceStore<PanesPaneData>>,
): void {
	panesStores.set(workspaceId, store);
}

/** Unregister a panes store. Called by `PanesWorkspace` on unmount.
 * Only removes the entry if it still points at the same store, so a
 * remount (register → unregister of the old store after the new one is
 * already registered) does not wipe the live store. */
export function unregisterPanesStore(
	workspaceId: string,
	store: StoreApi<WorkspaceStore<PanesPaneData>>,
): void {
	if (panesStores.get(workspaceId) === store) {
		panesStores.delete(workspaceId);
	}
}

/** Look up the active panes store for direct workspace navigation. */
export function getPanesStore(
	workspaceId: string,
): StoreApi<WorkspaceStore<PanesPaneData>> | null {
	return panesStores.get(workspaceId) ?? null;
}

export function openFileInPanes(
	workspaceId: string,
	options: AddFileViewerPaneOptions,
): string | null {
	const store = getPanesStore(workspaceId);
	return store ? openFileViewerInPanesStore(store, options) : null;
}

export function openCommentInPanes(
	workspaceId: string,
	comment: CommentPaneState,
): { tabId: string; paneId: string } | null {
	const store = getPanesStore(workspaceId);
	return store ? openCommentInPanesStore(store, comment) : null;
}

export function retargetPanesFileViewerPaths(
	workspaceId: string,
	oldAbsolutePath: string,
	newAbsolutePath: string,
	isDirectory: boolean,
): void {
	const store = getPanesStore(workspaceId);
	if (!store) return;
	for (const tab of store.getState().tabs) {
		for (const pane of Object.values(tab.panes)) {
			const viewer = pane.data.fileViewer;
			if (pane.kind !== "file-viewer" || !viewer) continue;
			const nextPath = isDirectory
				? viewer.filePath === oldAbsolutePath ||
					viewer.filePath.startsWith(`${oldAbsolutePath}/`)
					? `${newAbsolutePath}${viewer.filePath.slice(oldAbsolutePath.length)}`
					: null
				: viewer.filePath === oldAbsolutePath
					? newAbsolutePath
					: null;
			if (!nextPath) continue;
			store.getState().setPaneData({
				paneId: pane.id,
				data: { ...pane.data, fileViewer: { ...viewer, filePath: nextPath } },
			});
		}
	}
}
