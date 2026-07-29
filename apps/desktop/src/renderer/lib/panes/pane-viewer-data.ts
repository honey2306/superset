/**
 * Pane viewer payload types shared between the v1 shell and the panes engine.
 *
 * These describe the discriminated union of pane kinds the panes workspace
 * stores per pane (`WorkspaceState<PaneViewerData>`). Lifted out of the
 * v2-workspace route so the v1 shell, workspace-create code, and the
 * notification controller can depend on them without reaching into a route
 * tree that is slated for removal.
 */

export interface FilePaneData {
	filePath: string;
	mode: "editor" | "diff" | "preview";
	language?: string;
	viewId?: string;
	forceViewId?: string;
}

export interface TerminalPaneData {
	terminalId: string;
}

export interface BrowserPaneData {
	url: string;
	pageTitle?: string;
	faviconUrl?: string | null;
}

export interface DevtoolsPaneData {
	targetPaneId: string;
	targetTitle: string;
}

export type DiffFocusSide = "deletions" | "additions";

export interface DiffPaneData {
	path: string;
	changeKey?: string;
	collapsedFiles: string[];
	/** Line to scroll to within `path`. `focusTick` bumps on each navigation
	 *  request so it can take precedence over an older cached scroll state. */
	focusLine?: number;
	focusSide?: DiffFocusSide;
	focusTick?: number;
}

export interface CommentPaneData {
	commentId: string;
	authorLogin: string;
	avatarUrl?: string;
	body: string;
	url?: string;
	path?: string;
	line?: number;
}

export type PaneViewerData =
	| FilePaneData
	| TerminalPaneData
	| BrowserPaneData
	| DevtoolsPaneData
	| DiffPaneData
	| CommentPaneData;
