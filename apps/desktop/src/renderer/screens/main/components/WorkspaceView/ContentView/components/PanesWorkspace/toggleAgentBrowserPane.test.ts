import { describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import {
	findAgentBrowserPane,
	toggleAgentBrowserPane,
} from "./toggleAgentBrowserPane";
import type { PanesPaneData } from "./types";

function createAcpStore() {
	const store = createWorkspaceStore<PanesPaneData>();
	store.getState().addTab({
		id: "tab-1",
		panes: [
			{
				id: "acp-pane",
				kind: "acp",
				data: {
					acp: { sessionId: "session-1", agentDefinitionId: "claude" },
				},
			},
		],
	});
	return store;
}

describe("toggleAgentBrowserPane", () => {
	test("opens a session-bound companion to the right without stealing focus", () => {
		const store = createAcpStore();

		expect(
			toggleAgentBrowserPane({
				store,
				acpTabId: "tab-1",
				acpPaneId: "acp-pane",
				sessionId: "session-1",
			}),
		).toBe("opened");

		const tab = store.getState().getTab("tab-1");
		expect(tab?.activePaneId).toBe("acp-pane");
		expect(tab?.layout).toMatchObject({
			type: "split",
			direction: "horizontal",
			first: { type: "pane", paneId: "acp-pane" },
		});
		const browser = findAgentBrowserPane(store, "session-1");
		expect(browser?.tabId).toBe("tab-1");
		expect(browser && tab?.panes[browser.paneId]).toMatchObject({
			kind: "agent-browser",
			data: { agentBrowser: { sessionId: "session-1" } },
		});
	});

	test("a second toggle hides presentation without touching ACP pane data", () => {
		const store = createAcpStore();
		const input = {
			store,
			acpTabId: "tab-1",
			acpPaneId: "acp-pane",
			sessionId: "session-1",
		};
		toggleAgentBrowserPane(input);

		expect(toggleAgentBrowserPane(input)).toBe("closed");
		expect(findAgentBrowserPane(store, "session-1")).toBeNull();
		expect(store.getState().getPane("acp-pane")?.pane.data.acp?.sessionId).toBe(
			"session-1",
		);
	});

	test("finds and closes a companion even after it moves to another tab", () => {
		const store = createAcpStore();
		toggleAgentBrowserPane({
			store,
			acpTabId: "tab-1",
			acpPaneId: "acp-pane",
			sessionId: "session-1",
		});
		const browser = findAgentBrowserPane(store, "session-1");
		expect(browser).not.toBeNull();
		if (!browser) return;
		store.getState().movePaneToNewTab({ paneId: browser.paneId });

		expect(
			toggleAgentBrowserPane({
				store,
				acpTabId: "tab-1",
				acpPaneId: "acp-pane",
				sessionId: "session-1",
			}),
		).toBe("closed");
		expect(findAgentBrowserPane(store, "session-1")).toBeNull();
	});
});
