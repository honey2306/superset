import type { FileViewerState } from "shared/tabs-types";
import { FileViewerPane } from "../FileViewerPane";

/** Panes-engine host for the shared controlled file viewer. */
export function PanesFileViewerContent({
	paneId,
	tabId,
	worktreePath,
	fileViewer,
	isFocused,
	onFileViewerChange,
	onClose,
}: {
	paneId: string;
	tabId: string;
	worktreePath: string;
	fileViewer: FileViewerState;
	isFocused: boolean;
	onFileViewerChange: (fileViewer: FileViewerState) => void;
	onClose: () => void;
}) {
	return (
		<FileViewerPane
			paneId={paneId}
			tabId={tabId}
			worktreePath={worktreePath}
			onRequestClose={onClose}
			controlledFileViewer={fileViewer}
			controlledIsFocused={isFocused}
			onControlledFileViewerChange={onFileViewerChange}
		/>
	);
}
