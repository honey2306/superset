import { useEffect, useRef } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { FileViewerState, Pane } from "shared/tabs-types";
import { FileViewerPane } from "../TabView/FileViewerPane";

/**
 * Panes-engine host for the established v1 editor.
 *
 * The editor's document/session coordinator is keyed by pane id and currently
 * reads a v1 pane record. We supply that record only while mounted and mirror
 * its `fileViewer` state into pane data. `embedded` removes MosaicWindow
 * chrome, leaving the panes engine as the sole pane/window owner.
 */
export function V1PanesFileViewerContent({
	paneId,
	tabId,
	worktreePath,
	fileViewer,
	onFileViewerChange,
	onClose,
}: {
	paneId: string;
	tabId: string;
	worktreePath: string;
	fileViewer: FileViewerState;
	onFileViewerChange: (fileViewer: FileViewerState) => void;
	onClose: () => void;
}) {
	const currentFileViewer = useTabsStore(
		(state) => state.panes[paneId]?.fileViewer,
	);
	const initialFileViewerRef = useRef(fileViewer);
	const lastMirroredFileViewerRef = useRef<FileViewerState | undefined>(
		undefined,
	);

	useEffect(() => {
		useTabsStore.setState((state) => {
			if (state.panes[paneId]) return state;
			const compatibilityPane: Pane = {
				id: paneId,
				tabId,
				type: "file-viewer",
				name:
					initialFileViewerRef.current.displayName ??
					initialFileViewerRef.current.filePath.split("/").pop() ??
					"File",
				fileViewer: initialFileViewerRef.current,
			};
			return { panes: { ...state.panes, [paneId]: compatibilityPane } };
		});

		return () => {
			useTabsStore.setState((state) => {
				if (!state.panes[paneId]) return state;
				const { [paneId]: _removed, ...panes } = state.panes;
				return { panes };
			});
		};
	}, [paneId, tabId]);

	useEffect(() => {
		if (
			!currentFileViewer ||
			lastMirroredFileViewerRef.current === currentFileViewer
		)
			return;
		lastMirroredFileViewerRef.current = currentFileViewer;
		onFileViewerChange(currentFileViewer);
	}, [currentFileViewer, onFileViewerChange]);

	return (
		<FileViewerPane
			paneId={paneId}
			path={[]}
			tabId={tabId}
			worktreePath={worktreePath}
			splitPaneAuto={() => {}}
			splitPaneHorizontal={() => {}}
			splitPaneVertical={() => {}}
			removePane={onClose}
			setFocusedPane={() => {}}
			availableTabs={[]}
			onMoveToTab={() => {}}
			onMoveToNewTab={() => {}}
			embedded
			onRequestClose={onClose}
		/>
	);
}
