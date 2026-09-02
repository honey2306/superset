import type { SessionStatus } from "@superset/session-protocol";
import type { AcpAgentDefinitionId } from "renderer/lib/acp-session-launch";
import type { ChangeCategory, FileStatus } from "shared/changes-types";
import type {
	CommentPaneState,
	FileViewerMode,
	FileViewerState,
	PaneStatus,
} from "shared/tabs-types";

export type FileViewerReuseScope = "none" | "active-tab" | "workspace";

export interface OpenFileOptions {
	filePath: string;
	displayName?: string;
	viewMode?: FileViewerMode;
	diffCategory?: ChangeCategory;
	fileStatus?: FileStatus;
	commitHash?: string;
	oldPath?: string;
	line?: number;
	column?: number;
	isPinned?: boolean;
	openInNewTab?: boolean;
	reuseExisting?: FileViewerReuseScope;
}

export interface PanesPaneData {
	terminalId?: string;
	status?: PaneStatus;
	cwdConfirmed?: boolean;
	initialCommand?: string;
	initialCwd?: string;
	cwd?: string | null;
	workspaceRun?: {
		workspaceId: string;
		state: "running" | "stopped-by-user" | "stopped-by-exit";
		command?: string;
		completionMarker?: string;
	};
	lifecycleScript?: {
		kind: "setup" | "teardown";
		state: "running" | "succeeded" | "failed";
		exitCode?: number;
	};
	fileViewer?: FileViewerState;
	comment?: CommentPaneState;
	agentBrowser?: {
		/** ACP conversation that owns the background browser runtime. */
		sessionId: string;
	};
	acp?: {
		sessionId: string;
		agentDefinitionId: AcpAgentDefinitionId;
		/** First generated session title, kept stable for the tab label. */
		title?: string;
		/** Latest agent-provided title, shown in the pane status bar. */
		statusTitle?: string;
		latestUserMessage?: string;
		status?: SessionStatus;
		/** Seen-aware status used by tab and workspace notification indicators. */
		notificationStatus?: PaneStatus;
		isLaunching?: boolean;
		creationError?: string;
	};
}

export type PaneNavigationResult<T = undefined> =
	| { status: "applied"; value: T }
	| { status: "queued"; intentId: string; deduplicated: boolean }
	| { status: "rejected"; reason: "queue-full" | "expired" };
