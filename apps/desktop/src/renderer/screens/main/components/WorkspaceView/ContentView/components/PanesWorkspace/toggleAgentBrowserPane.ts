import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PanesPaneData } from "./types";

export interface AgentBrowserPaneLocation {
	tabId: string;
	paneId: string;
}

export function findAgentBrowserPane(
	store: StoreApi<WorkspaceStore<PanesPaneData>>,
	sessionId: string,
): AgentBrowserPaneLocation | null {
	for (const tab of store.getState().tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (
				pane.kind === "agent-browser" &&
				pane.data.agentBrowser?.sessionId === sessionId
			) {
				return { tabId: tab.id, paneId: pane.id };
			}
		}
	}
	return null;
}

/**
 * Toggle presentation only. The browser runtime belongs to the ACP daemon and
 * deliberately outlives this companion pane.
 */
export function toggleAgentBrowserPane(input: {
	store: StoreApi<WorkspaceStore<PanesPaneData>>;
	acpTabId: string;
	acpPaneId: string;
	sessionId: string;
}): "opened" | "closed" {
	const existing = findAgentBrowserPane(input.store, input.sessionId);
	if (existing) {
		input.store.getState().closePane(existing);
		return "closed";
	}

	input.store.getState().splitPane({
		tabId: input.acpTabId,
		paneId: input.acpPaneId,
		position: "right",
		newPane: {
			kind: "agent-browser",
			data: { agentBrowser: { sessionId: input.sessionId } },
		},
		selectNewPane: false,
	});
	return "opened";
}
