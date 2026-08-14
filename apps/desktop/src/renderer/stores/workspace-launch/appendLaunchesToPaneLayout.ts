import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/lib/panes/pane-viewer-data";

const EMPTY_STATE: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

export type WorkspacePaneAgentLaunch =
	| { ok: true; kind: "terminal"; sessionId: string; label?: string }
	| { ok: false; error: string };

export interface WorkspacePaneLaunchInput {
	existing: WorkspaceState<PaneViewerData> | undefined;
	terminals: Array<{ terminalId: string; label?: string }>;
	agents: WorkspacePaneAgentLaunch[];
}

interface PaneLaunch {
	kind: "terminal";
	sessionId: string;
	label?: string;
}

/**
 * Folds sessions returned by the host Provisioning operation into the local
 * pane presentation state. The host owns Workspace identity; this helper only
 * updates renderer-owned tabs and panes after a canonical ID is known.
 */
export function appendLaunchesToPaneLayout({
	existing,
	terminals,
	agents,
}: WorkspacePaneLaunchInput): WorkspaceState<PaneViewerData> {
	const terminalLaunches: PaneLaunch[] = terminals.map((entry) => ({
		kind: "terminal",
		sessionId: entry.terminalId,
		label: entry.label,
	}));
	const agentLaunches: PaneLaunch[] = agents
		.filter(
			(
				entry,
			): entry is Extract<
				WorkspacePaneAgentLaunch,
				{ ok: true; kind: "terminal" }
			> => entry.ok && entry.kind === "terminal",
		)
		.map((entry) => ({
			kind: "terminal",
			sessionId: entry.sessionId,
			label: entry.label,
		}));
	const launches = [...terminalLaunches, ...agentLaunches];

	if (launches.length === 0) {
		return existing ?? EMPTY_STATE;
	}

	const store = createWorkspaceStore<PaneViewerData>({
		initialState: existing ?? EMPTY_STATE,
	});

	for (const launch of launches) {
		store.getState().addTab({
			titleOverride: launch.label,
			panes: [
				{
					kind: "terminal",
					data: {
						terminalId: launch.sessionId,
					} satisfies TerminalPaneData,
				},
			],
		});
	}

	const next = store.getState();
	return {
		version: next.version,
		tabs: next.tabs,
		activeTabId: next.activeTabId,
	};
}
