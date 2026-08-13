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
	};
	lifecycleScript?: {
		kind: "setup" | "teardown";
		state: "running" | "succeeded" | "failed";
		exitCode?: number;
	};
	fileViewer?: FileViewerState;
	comment?: CommentPaneState;
	acp?: {
		sessionId: string;
		agentDefinitionId: AcpAgentDefinitionId;
		title?: string;
		latestUserMessage?: string;
		status?: SessionStatus;
		isLaunching?: boolean;
		creationError?: string;
	};
}

export type PaneNavigationResult<T = undefined> =
	| { status: "applied"; value: T }
	| { status: "queued"; intentId: string; deduplicated: boolean }
	| { status: "rejected"; reason: "queue-full" | "expired" };
