import type {
	CommentPaneState,
	FileViewerState,
	PaneStatus,
} from "shared/tabs-types";
import type { HostServiceTerminalPaneSnapshot } from "../Terminal/host-service-terminal-pane-bridge";

/**
 * Pane data for the v2-panes-in-v1 mount.
 *
 * Browser (webview) and devtools panes were removed for single-user setup.
 * Remaining kinds: terminal, file-viewer, comment.
 */
export interface V1PanesPaneData extends HostServiceTerminalPaneSnapshot {
	/** Backend terminal session id for the `terminal` kind. */
	terminalId?: string;
	status?: PaneStatus;
	cwdConfirmed?: boolean;
	/** Shell command run once on session create (preset launch). */
	initialCommand?: string;
	/** Working directory for the session (preset cwd). */
	initialCwd?: string;

	// --- file viewer pane (kind: "file-viewer") ---
	fileViewer?: FileViewerState;

	// --- comment pane (kind: "comment") ---
	comment?: CommentPaneState;
}
