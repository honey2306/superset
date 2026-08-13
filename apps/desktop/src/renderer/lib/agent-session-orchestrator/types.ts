import type {
	AgentLaunchRequest,
	AgentLaunchResult,
	AgentLaunchSource,
} from "@superset/shared/agent-launch";
import type { TerminalPreset } from "@superset/shared/desktop-types";
import type { HostTerminalLauncher } from "renderer/lib/terminal/host-terminal-launcher";

export interface AgentLaunchPane {
	id: string;
	tabId: string;
	type: string;
}

export interface AgentLaunchTab {
	id: string;
	workspaceId: string;
}

export interface AgentLaunchTabsAdapter {
	getPane: (paneId: string) => AgentLaunchPane | undefined;
	getTab: (tabId: string) => AgentLaunchTab | undefined;
	addTerminalTab: (workspaceId: string) => { tabId: string; paneId: string };
	addTerminalPane: (tabId: string) => string;
	removePane: (paneId: string) => void;
	setTabAutoTitle: (tabId: string, title: string) => void;
}

export interface AgentSessionLaunchContext {
	source?: AgentLaunchSource;
	/**
	 * Host URL used for non-React Catalog lookups during launch. File-backed
	 * prompt/attachment setup must resolve paths from the host Catalog rather
	 * than the legacy Electron workspace table.
	 */
	hostUrl?: string;
	tabs?: AgentLaunchTabsAdapter;
	terminalLauncher: HostTerminalLauncher;
	captureEvent?: (input: {
		event: "agent_session_launch";
		properties: Record<string, unknown>;
	}) => void;
}

export interface QueueAgentSessionLaunchInput {
	request: AgentLaunchRequest | unknown;
	projectId?: string;
	initialCommands?: string[] | null;
	defaultPresets?: TerminalPreset[];
}

export type AgentSessionLaunchAdapterKind = "terminal";

export type LaunchResultPayload = Pick<
	AgentLaunchResult,
	"tabId" | "paneId" | "sessionId"
>;
