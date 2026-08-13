import type { SessionStatus } from "@superset/session-protocol";
import type { AcpAgentDefinitionId } from "renderer/lib/acp-session-launch";
import type {
	CommentPaneState,
	FileViewerState,
	PaneStatus,
} from "shared/tabs-types";
import type { HostServiceTerminalPaneSnapshot } from "../Terminal/host-service-terminal-pane-bridge";

/**
 * Pane data for the Host-backed panes mount.
 *
 * Browser (webview) and devtools panes were removed for single-user setup.
 * Remaining kinds: terminal, file-viewer, comment.
 */
export interface PanesPaneData extends HostServiceTerminalPaneSnapshot {
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

	// --- ACP agent pane (kind: "acp") ---
	acp?: {
		sessionId: string;
		agentDefinitionId: AcpAgentDefinitionId;
		/**
		 * Session subject shown on the tab. Stable across turns: prefers the
		 * agent-supplied session title, falls back to the first user prompt.
		 */
		title?: string;
		/**
		 * Latest user prompt in the session, shown in the toolbar/status bar.
		 * Distinct from `title` so the tab keeps a stable subject while the
		 * toolbar tracks the current thread of work.
		 */
		latestUserMessage?: string;
		status?: SessionStatus;
		/** The host is still creating this caller-assigned session id. */
		isLaunching?: boolean;
		/** Last creation failure; preserved in the tab so it is not orphaned. */
		creationError?: string;
	};
}
