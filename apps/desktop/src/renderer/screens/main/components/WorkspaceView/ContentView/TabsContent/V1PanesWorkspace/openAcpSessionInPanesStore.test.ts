import { describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import { openAcpSessionInPanesStore } from "./openAcpSessionInPanesStore";
import type { V1PanesPaneData } from "./types";

describe("openAcpSessionInPanesStore", () => {
	test("opens the ACP session in a new active tab instead of splitting the current tab", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();
		store.getState().addTab({
			id: "terminal-tab",
			panes: [
				{
					id: "terminal-pane",
					kind: "terminal",
					data: { terminalId: "terminal-1" },
				},
			],
		});

		openAcpSessionInPanesStore(store, {
			sessionId: "session-1",
			agentDefinitionId: "claude",
			title: "Fix login",
		});

		const state = store.getState();
		expect(state.tabs).toHaveLength(2);
		expect(Object.keys(state.tabs[0]?.panes ?? {})).toEqual(["terminal-pane"]);

		const activeTab = state.getActiveTab();
		expect(activeTab?.id).not.toBe("terminal-tab");
		expect(Object.values(activeTab?.panes ?? {})).toEqual([
			expect.objectContaining({
				kind: "acp",
				data: {
					acp: {
						sessionId: "session-1",
						agentDefinitionId: "claude",
						title: "Fix login",
					},
				},
			}),
		]);
	});

	test("persists Codex as the pane agent definition", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();

		openAcpSessionInPanesStore(store, {
			sessionId: "codex-session",
			agentDefinitionId: "codex",
			title: "Codex task",
		});

		const pane = Object.values(store.getState().getActiveTab()?.panes ?? {})[0];
		expect(pane?.data.acp).toEqual({
			sessionId: "codex-session",
			agentDefinitionId: "codex",
			title: "Codex task",
		});
	});

	test("focuses an existing session pane instead of opening a duplicate tab", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();
		store.getState().addTab({
			id: "existing-tab",
			panes: [
				{
					id: "existing-pane",
					kind: "acp",
					data: {
						acp: { sessionId: "session-1", agentDefinitionId: "claude" },
					},
				},
			],
		});
		store.getState().addTab({
			id: "other-tab",
			panes: [{ kind: "terminal", data: { terminalId: "t" } }],
		});

		openAcpSessionInPanesStore(store, {
			sessionId: "session-1",
			agentDefinitionId: "claude",
			title: "Ignored",
		});

		expect(store.getState().tabs).toHaveLength(2);
		expect(store.getState().getActiveTab()?.id).toBe("existing-tab");
	});

	test("updates the starting pane with the retained creation failure", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();

		openAcpSessionInPanesStore(store, {
			sessionId: "session-1",
			agentDefinitionId: "claude",
			title: null,
			status: "starting",
			isLaunching: true,
		});
		openAcpSessionInPanesStore(store, {
			sessionId: "session-1",
			agentDefinitionId: "claude",
			title: null,
			status: "dead",
			isLaunching: false,
			creationError: "adapter failed to start",
		});

		expect(store.getState().tabs).toHaveLength(1);
		const pane = Object.values(store.getState().getActiveTab()?.panes ?? {})[0];
		expect(pane?.data.acp).toMatchObject({
			sessionId: "session-1",
			status: "dead",
			isLaunching: false,
			creationError: "adapter failed to start",
		});
	});
});
