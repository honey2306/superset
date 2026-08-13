import { beforeEach, describe, expect, it } from "bun:test";
import type { WorkspaceState } from "@superset/panes";
import {
	configurePanesPersistence,
	getPanesStore,
	hydratePanesRepository,
	resetPanesRepositoryForTests,
	unregisterPanesStore,
} from "./repository";
import type { PanesPaneData } from "./types";

const workspaceId = "11111111-1111-1111-1111-111111111111";
const empty: WorkspaceState<PanesPaneData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

beforeEach(() => resetPanesRepositoryForTests());

describe("durable panes repository", () => {
	it("creates stores from durable rows and survives route unmount", () => {
		hydratePanesRepository([{ workspaceId, paneLayout: empty }]);
		const store = getPanesStore(workspaceId);
		expect(store).not.toBeNull();
		if (!store) throw new Error("store missing");
		unregisterPanesStore(workspaceId, store);
		expect(getPanesStore(workspaceId)).toBe(store);
	});

	it("hydrates an empty layout", () => {
		hydratePanesRepository([{ workspaceId, paneLayout: empty }]);
		expect(getPanesStore(workspaceId)?.getState().tabs).toEqual([]);
	});

	it("reconnect hydration updates the existing store identity", () => {
		hydratePanesRepository([{ workspaceId, paneLayout: empty }]);
		const store = getPanesStore(workspaceId);
		const restored: WorkspaceState<PanesPaneData> = {
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
		hydratePanesRepository([{ workspaceId, paneLayout: restored }]);
		expect(getPanesStore(workspaceId)).toBe(store);
		expect(store?.getState().getPane("pane-1")?.pane.data.terminalId).toBe(
			"terminal-1",
		);
	});

	it("persists operations for an unmounted hydrated workspace", () => {
		let persisted = empty;
		configurePanesPersistence((_id, update) => {
			persisted = update(persisted);
			return true;
		});
		hydratePanesRepository([{ workspaceId, paneLayout: empty }]);
		getPanesStore(workspaceId)
			?.getState()
			.addTab({
				id: "tab-1",
				panes: [
					{
						id: "pane-1",
						kind: "terminal",
						data: { terminalId: "terminal-1" },
					},
				],
			});
		expect(persisted.tabs[0]?.panes["pane-1"]).toBeDefined();
	});
});
