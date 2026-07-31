import { describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { V1PanesPaneData } from "./types";
import { openV1PanesPreset } from "./useV1PanesPresetOpeners";

const preset = {
	name: "dev",
	commands: ["bun run dev"],
	cwd: "/repo",
};

describe("openV1PanesPreset", () => {
	test("current-pane replaces the active pane without changing its layout position", async () => {
		const store = createWorkspaceStore<V1PanesPaneData>();
		store.getState().addTab({
			id: "tab-1",
			panes: [
				{
					id: "pane-left",
					kind: "file-viewer",
					data: { fileViewer: { filePath: "/old.ts" } as never },
				},
				{
					id: "pane-active",
					kind: "terminal",
					data: { terminalId: "old-terminal" },
				},
			],
			activePaneId: "pane-active",
		});
		const beforeLayout = store.getState().getActiveTab()?.layout;

		await openV1PanesPreset(store, preset, { target: "current-pane" });

		const tab = store.getState().getActiveTab();
		expect(Object.keys(tab?.panes ?? {})).toHaveLength(2);
		expect(tab?.panes["pane-active"]).toBeUndefined();
		expect(tab?.activePaneId).not.toBe("pane-active");
		expect(tab?.panes[tab.activePaneId ?? ""]?.data).toMatchObject({
			initialCommand: "bun run dev",
			initialCwd: "/repo",
		});
		expect(tab?.layout).not.toEqual(beforeLayout);
		expect(tab?.layout.type).toBe("split");
	});
});
