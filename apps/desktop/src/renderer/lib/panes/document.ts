import type { WorkspaceState } from "@superset/panes";
import { isNewFile } from "shared/changes-types";
import { hasRenderedPreview, isImageFile } from "shared/file-types";
import type { CommentPaneState, FileViewerState } from "shared/tabs-types";
import { navigatePanes } from "./navigation";
import { type PanesStore, updatePersistedPaneLayout } from "./repository";
import type {
	OpenFileOptions,
	PaneNavigationResult,
	PanesPaneData,
} from "./types";

export function shouldBlockFileClose(isDirty: boolean): boolean {
	return isDirty;
}

export function createFileViewer(options: OpenFileOptions): FileViewerState {
	let viewMode = options.viewMode;
	if (!viewMode) {
		if (isImageFile(options.filePath)) viewMode = "rendered";
		else if (
			options.diffCategory &&
			options.fileStatus &&
			isNewFile(options.fileStatus)
		)
			viewMode = hasRenderedPreview(options.filePath) ? "rendered" : "raw";
		else if (options.diffCategory) viewMode = "diff";
		else viewMode = hasRenderedPreview(options.filePath) ? "rendered" : "raw";
	}
	return {
		filePath: options.filePath,
		viewMode,
		isPinned: options.isPinned ?? false,
		diffLayout: "inline",
		diffCategory: options.diffCategory,
		commitHash: options.commitHash,
		oldPath: options.oldPath,
		initialLine: options.line,
		initialColumn: options.column,
		displayName: options.displayName,
	};
}

export function openFileInStore(
	store: PanesStore,
	options: OpenFileOptions,
): string {
	const state = store.getState();
	const fileViewer = createFileViewer(options);
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
				state.setActivePane({ tabId: tab.id, paneId: pane.id });
				return pane.id;
			}
		}
	}
	const paneId = crypto.randomUUID();
	const newPane = { id: paneId, kind: "file-viewer", data: { fileViewer } };
	const activeTab = state.getActiveTab();
	const sourcePane = activeTab ? state.getActivePane(activeTab.id)?.pane : null;
	if (!activeTab || !sourcePane || options.openInNewTab) {
		state.addTab({ panes: [newPane] });
	} else {
		state.splitPane({
			tabId: activeTab.id,
			paneId: sourcePane.id,
			position: "right",
			newPane,
		});
	}
	return paneId;
}

export function openFileInPanes(
	workspaceId: string,
	options: OpenFileOptions,
): PaneNavigationResult<string> {
	return navigatePanes({
		workspaceId,
		dedupeKey: `file:${JSON.stringify(options)}`,
		apply: (store) => openFileInStore(store, options),
	});
}

export function openCommentInPanes(
	workspaceId: string,
	comment: CommentPaneState,
): PaneNavigationResult<{ tabId: string; paneId: string }> {
	return navigatePanes({
		workspaceId,
		dedupeKey: `comment:${comment.commentId}`,
		apply: (store) => {
			const paneId = crypto.randomUUID();
			const tabId = crypto.randomUUID();
			store.getState().addTab({
				id: tabId,
				panes: [{ id: paneId, kind: "comment", data: { comment } }],
			});
			return { tabId, paneId };
		},
	});
}

function retargetLayout(
	layout: WorkspaceState<PanesPaneData>,
	oldAbsolutePath: string,
	newAbsolutePath: string,
	isDirectory: boolean,
): WorkspaceState<PanesPaneData> {
	let changed = false;
	const tabs = layout.tabs.map((tab) => {
		let tabChanged = false;
		const panes = { ...tab.panes };
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
			panes[pane.id] = {
				...pane,
				data: {
					...pane.data,
					fileViewer: { ...viewer, filePath: nextPath },
				},
			};
			tabChanged = true;
			changed = true;
		}
		return tabChanged ? { ...tab, panes } : tab;
	});
	return changed ? { ...layout, tabs } : layout;
}

export function retargetPanesFileViewerPaths(
	workspaceId: string,
	oldAbsolutePath: string,
	newAbsolutePath: string,
	isDirectory: boolean,
): boolean {
	return updatePersistedPaneLayout(workspaceId, (layout) =>
		retargetLayout(layout, oldAbsolutePath, newAbsolutePath, isDirectory),
	);
}
