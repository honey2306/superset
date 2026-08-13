import { type MutableRefObject, type ReactNode, useCallback } from "react";
import {
	type CodeEditorAdapter,
	EditorContextMenu,
	useEditorActions,
} from "../../../../components";
import type { PaneTabTarget } from "../../../PaneContextMenuItems/PaneContextMenuItems";

interface FileEditorContextMenuProps {
	children: ReactNode;
	editorRef: MutableRefObject<CodeEditorAdapter | null>;
	filePath: string;
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onEqualizePaneSplits?: () => void;
	onClosePane: () => void;
	currentTabId: string;
	availableTabs: PaneTabTarget[];
	onMoveToTab: (tabId: string) => void;
	onMoveToNewTab: () => void;
}

export function FileEditorContextMenu({
	children,
	editorRef,
	filePath,
	onSplitHorizontal,
	onSplitVertical,
	onEqualizePaneSplits,
	onClosePane,
	currentTabId,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
}: FileEditorContextMenuProps) {
	const getEditor = useCallback(() => editorRef.current, [editorRef]);

	const editorActions = useEditorActions({
		getEditor,
		filePath,
		editable: true,
	});

	return (
		<EditorContextMenu
			editorActions={editorActions}
			paneActions={{
				onSplitHorizontal,
				onSplitVertical,
				onEqualizePaneSplits,
				onClosePane,
				currentTabId,
				availableTabs,
				onMoveToTab,
				onMoveToNewTab,
			}}
		>
			{children}
		</EditorContextMenu>
	);
}
