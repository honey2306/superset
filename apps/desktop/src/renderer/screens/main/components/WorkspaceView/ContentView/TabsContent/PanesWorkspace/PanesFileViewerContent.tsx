import type { FileViewerState } from "shared/tabs-types";
import { FileViewerPane } from "../TabView/FileViewerPane";

/** Panes-engine host for the shared controlled file viewer. */
export function PanesFileViewerContent({
	paneId,
	tabId,
	worktreePath,
	fileViewer,
	isFocused,
	onFileViewerChange,
	onPin,
	onClose,
}: {
	paneId: string;
	tabId: string;
	worktreePath: string;
	fileViewer: FileViewerState;
	isFocused: boolean;
	onFileViewerChange: (fileViewer: FileViewerState) => void;
	onPin: () => void;
	onClose: () => void;
}) {
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
			controlledFileViewer={fileViewer}
			controlledIsFocused={isFocused}
			onControlledFileViewerChange={onFileViewerChange}
			onControlledPin={onPin}
		/>
	);
}
