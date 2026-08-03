import { describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "renderer/lib/panes/pane-viewer-data";
import {
	appendLaunchesToPaneLayout,
	type WorkspacePaneAgentLaunch,
} from "./appendLaunchesToPaneLayout";

describe("appendLaunchesToPaneLayout", () => {
	test("preserves an existing layout when no sessions were launched", () => {
		const existing = createWorkspaceStore<PaneViewerData>().getState();

		expect(
			appendLaunchesToPaneLayout({
				existing,
				terminals: [],
				agents: [],
			}),
		).toEqual(existing);
	});

	test("adds terminal launches and ignores failed or chat agent launches", () => {
		const agents: WorkspacePaneAgentLaunch[] = [
			{ ok: false, error: "unavailable" },
			{ ok: true, kind: "chat", sessionId: "chat-1", label: "Chat" },
			{ ok: true, kind: "terminal", sessionId: "agent-1", label: "Agent" },
		];

		const layout = appendLaunchesToPaneLayout({
			existing: undefined,
			terminals: [{ terminalId: "terminal-1", label: "Shell" }],
			agents,
		});

		expect(layout.tabs).toHaveLength(2);
		expect(layout.tabs.map((tab) => tab.titleOverride)).toEqual([
			"Shell",
			"Agent",
		]);
		expect(layout.tabs.flatMap((tab) => Object.values(tab.panes))).toEqual([
			expect.objectContaining({
				data: { terminalId: "terminal-1" },
			}),
			expect.objectContaining({
				data: { terminalId: "agent-1" },
			}),
		]);
	});
});
