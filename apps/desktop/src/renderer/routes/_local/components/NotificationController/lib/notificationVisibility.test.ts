import { describe, expect, it } from "bun:test";
import type { WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/lib/panes/pane-viewer-data";
import { shouldSuppressNotification } from "./notificationVisibility";

const paneLayout: WorkspaceState<PaneViewerData> = {
	version: 1,
	activeTabId: "tab-1",
	tabs: [
		{
			id: "tab-1",
			createdAt: 1,
			activePaneId: "pane-1",
			layout: { type: "pane", paneId: "pane-1" },
			panes: {
				"pane-1": {
					id: "pane-1",
					kind: "terminal",
					data: { terminalId: "terminal-1" },
				},
			},
		},
	],
};

const target = {
	workspaceId: "workspace-1",
	tabId: "tab-1",
	paneId: "pane-1",
	terminalId: "terminal-1",
};

describe("shouldSuppressNotification", () => {
	it("suppresses only when the projected target and window are both focused", () => {
		expect(
			shouldSuppressNotification({
				target,
				paneLayout,
				currentWorkspaceId: "workspace-1",
				documentHidden: false,
				windowFocused: true,
			}),
		).toBe(true);
	});

	it("does not suppress a visible projected pane when the window is unfocused", () => {
		expect(
			shouldSuppressNotification({
				target,
				paneLayout,
				currentWorkspaceId: "workspace-1",
				documentHidden: false,
				windowFocused: false,
			}),
		).toBe(false);
	});
});
