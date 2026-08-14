import { describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "renderer/lib/panes/pane-viewer-data";
import { appendLaunchesToPaneLayout } from "./appendLaunchesToPaneLayout";

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
});
