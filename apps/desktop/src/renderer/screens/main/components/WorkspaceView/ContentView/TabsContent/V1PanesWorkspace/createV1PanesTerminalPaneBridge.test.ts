import { describe, expect, test } from "bun:test";
import { createWorkspaceStore, type RendererContext } from "@superset/panes";
import { createV1PanesTerminalPaneBridge } from "./createV1PanesTerminalPaneBridge";
import type { V1PanesPaneData } from "./types";

function makeContext(): RendererContext<V1PanesPaneData> {
	const store = createWorkspaceStore<V1PanesPaneData>();
	store.getState().addTab({
		id: "tab-1",
		panes: [
			{
				id: "pane-1",
				kind: "terminal",
				data: {
					terminalId: "terminal-1",
					initialCommand: "codex",
					initialCwd: "/repo",
					workspaceRun: {
						workspaceId: "workspace-1",
						state: "running",
					},
				},
			},
		],
	});
	const pane = store.getState().getPane("pane-1")?.pane;
	const tab = store.getState().getTab("tab-1");
	if (!pane || !tab) throw new Error("fixture setup failed");

	return {
		pane: { ...pane, parentDirection: null },
		tab: { ...tab, position: 0 },
		isActive: true,
		store,
		actions: {
			close: () => {},
			focus: () => {},
			setTitle: () => {},
			pin: () => {},
			updateData: () => {},
			split: () => {},
		},
		components: { PaneHeaderActions: () => null },
	};
}

describe("createV1PanesTerminalPaneBridge", () => {
	test("routes terminal state writes to the panes store", () => {
		const context = makeContext();
		const bridge = createV1PanesTerminalPaneBridge(context);

		bridge.setTitle("Codex");
		bridge.setStatus("working");
		bridge.setCwd("/repo/apps/desktop", true);
		bridge.setWorkspaceRunState("stopped-by-exit");
		bridge.setLifecycleScript({
			kind: "setup",
			state: "succeeded",
			exitCode: 0,
		});
		bridge.clearInitialData();

		const pane = context.store.getState().getPane("pane-1")?.pane;
		expect(pane?.titleOverride).toBe("Codex");
		expect(pane?.data).toMatchObject({
			terminalId: "terminal-1",
			status: "working",
			cwd: "/repo/apps/desktop",
			cwdConfirmed: true,
			workspaceRun: {
				workspaceId: "workspace-1",
				state: "stopped-by-exit",
			},
			lifecycleScript: {
				kind: "setup",
				state: "succeeded",
				exitCode: 0,
			},
		});
		expect(pane?.data.initialCommand).toBeUndefined();
		expect(pane?.data.initialCwd).toBeUndefined();
	});

	test("reports destruction and closes the panes-store pane", () => {
		const context = makeContext();
		const bridge = createV1PanesTerminalPaneBridge(context);

		expect(bridge.isDestroyed()).toBe(false);
		bridge.close();
		expect(bridge.isDestroyed()).toBe(true);
	});
});
