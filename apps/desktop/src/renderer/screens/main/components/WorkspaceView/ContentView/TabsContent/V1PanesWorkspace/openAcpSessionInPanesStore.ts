import type { WorkspaceStore } from "@superset/panes";
import type { SessionStatus } from "@superset/session-protocol";
import type { AcpAgentDefinitionId } from "renderer/lib/acp-session-launch";
import type { StoreApi } from "zustand/vanilla";
import type { V1PanesPaneData } from "./types";

export interface OpenAcpSessionInput {
	sessionId: string;
	agentDefinitionId: AcpAgentDefinitionId;
	title: string | null;
	status?: SessionStatus;
	isLaunching?: boolean;
	creationError?: string;
}

/**
 * Open an ACP session as a standalone tab, matching terminal launch behavior.
 * Sessions should not unexpectedly split the pane the user is currently using.
 */
export function openAcpSessionInPanesStore(
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>,
	input: OpenAcpSessionInput,
): void {
	const state = store.getState();
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "acp" || pane.data.acp?.sessionId !== input.sessionId)
				continue;
			state.setPaneData({
				paneId: pane.id,
				data: {
					...pane.data,
					acp: {
						...pane.data.acp,
						title: input.title ?? undefined,
						status: input.status ?? pane.data.acp.status,
						isLaunching: input.isLaunching,
						creationError: input.creationError,
					},
				},
			});
			state.setActiveTab(tab.id);
			state.setActivePane({ tabId: tab.id, paneId: pane.id });
			return;
		}
	}
	state.addTab({
		panes: [
			{
				kind: "acp",
				data: {
					acp: {
						sessionId: input.sessionId,
						agentDefinitionId: input.agentDefinitionId,
						title: input.title ?? undefined,
						status: input.status,
						isLaunching: input.isLaunching,
						creationError: input.creationError,
					},
				},
			},
		],
	});
}
