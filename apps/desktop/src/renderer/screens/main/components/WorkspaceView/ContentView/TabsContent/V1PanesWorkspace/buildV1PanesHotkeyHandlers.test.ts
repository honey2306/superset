import { describe, expect, mock, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import { buildV1PanesHotkeyHandlers } from "./buildV1PanesHotkeyHandlers";
import type { V1PanesPaneData } from "./types";

function makeStoreWithTerminalPane() {
	const store = createWorkspaceStore<V1PanesPaneData>();
	store.getState().addTab({
		panes: [{ kind: "terminal", data: { terminalId: "term-1" } }],
	});
	return store;
}

function activePaneId(store: ReturnType<typeof makeStoreWithTerminalPane>) {
	const tab = store.getState().getActiveTab();
	const pane = tab ? Object.values(tab.panes)[0] : undefined;
	return pane?.id;
}

describe("buildV1PanesHotkeyHandlers", () => {
	test("closePane invokes the registry onBeforeClose guard before closing", async () => {
		const store = makeStoreWithTerminalPane();
		const paneId = activePaneId(store);
		expect(paneId).toBeDefined();
		const onBeforeClose = mock<(pane: never) => Promise<boolean>>(
			async () => true,
		);
		const registry = {
			terminal: { onBeforeClose },
		} as never;
		const handlers = buildV1PanesHotkeyHandlers({
			store,
			registry,
			launcher: { create: async () => "term-2" },
			addTerminalTab: mock(),
		});

		await handlers.closePane();

		expect(onBeforeClose).toHaveBeenCalledTimes(1);
		// The pane is closed when the guard allows it.
		const tab = store.getState().getActiveTab();
		const paneGone = tab ? !Object.keys(tab.panes).length : true;
		// addTab keeps the tab; closing the only pane removes it from layout.
		expect(paneGone || tab?.panes[paneId ?? ""] === undefined).toBe(true);
	});

	test("closePane does NOT close when the guard resolves false", async () => {
		const store = makeStoreWithTerminalPane();
		const paneId = activePaneId(store);
		const onBeforeClose = mock<(pane: never) => Promise<boolean>>(
			async () => false,
		);
		const registry = { terminal: { onBeforeClose } } as never;
		const handlers = buildV1PanesHotkeyHandlers({
			store,
			registry,
			launcher: { create: async () => "term-2" },
			addTerminalTab: mock(),
		});

		await handlers.closePane();

		expect(onBeforeClose).toHaveBeenCalledTimes(1);
		// Pane still present — the close was guarded.
		const tab = store.getState().getActiveTab();
		expect(tab?.panes[paneId ?? ""]).toBeDefined();
	});

	test("closePane closes without a guard when the registry has no onBeforeClose", async () => {
		const store = makeStoreWithTerminalPane();
		const paneId = activePaneId(store);
		const registry = { terminal: {} } as never;
		const handlers = buildV1PanesHotkeyHandlers({
			store,
			registry,
			launcher: { create: async () => "term-2" },
			addTerminalTab: mock(),
		});

		await handlers.closePane();

		const tab = store.getState().getActiveTab();
		expect(tab?.panes[paneId ?? ""]).toBeUndefined();
	});

	test("splitRight splits a new terminal pane to the right of the active pane", async () => {
		const store = makeStoreWithTerminalPane();
		const handlers = buildV1PanesHotkeyHandlers({
			store,
			registry: { terminal: {} } as never,
			launcher: { create: async () => "term-2" },
			addTerminalTab: mock(),
		});

		await handlers.splitRight();

		const tab = store.getState().getActiveTab();
		expect(Object.keys(tab?.panes ?? {})).toHaveLength(2);
		expect(tab?.layout.type).toBe("split");
	});

	test("splitDown splits a new terminal pane below the active pane", async () => {
		const store = makeStoreWithTerminalPane();
		const handlers = buildV1PanesHotkeyHandlers({
			store,
			registry: { terminal: {} } as never,
			launcher: { create: async () => "term-3" },
			addTerminalTab: mock(),
		});

		await handlers.splitDown();

		const tab = store.getState().getActiveTab();
		expect(Object.keys(tab?.panes ?? {})).toHaveLength(2);
	});

	test("equalize calls equalizeTab for the active tab", () => {
		const store = makeStoreWithTerminalPane();
		const tab = store.getState().getActiveTab();
		expect(tab).toBeDefined();
		// equalize on a single-pane tab is a no-op but must not throw.
		const handlers = buildV1PanesHotkeyHandlers({
			store,
			registry: { terminal: {} } as never,
			launcher: { create: async () => "term-4" },
			addTerminalTab: mock(),
		});
		expect(() => handlers.equalize()).not.toThrow();
	});

	test("newGroup calls the injected addTerminalTab", () => {
		const store = makeStoreWithTerminalPane();
		const addTerminalTab = mock();
		const handlers = buildV1PanesHotkeyHandlers({
			store,
			registry: { terminal: {} } as never,
			launcher: { create: async () => "term-5" },
			addTerminalTab,
		});
		handlers.newGroup();
		expect(addTerminalTab).toHaveBeenCalledTimes(1);
	});

	test("prevTab / nextTab cycle through tabs", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();
		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "t1" } }],
		});
		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "t2" } }],
		});
		const handlers = buildV1PanesHotkeyHandlers({
			store,
			registry: { terminal: {} } as never,
			launcher: { create: async () => "t3" },
			addTerminalTab: mock(),
		});
		const firstId = store.getState().tabs[0].id;
		const secondId = store.getState().tabs[1].id;
		// Active is the most recently added tab.
		expect(store.getState().activeTabId).toBe(secondId);
		handlers.prevTab();
		expect(store.getState().activeTabId).toBe(firstId);
		handlers.nextTab();
		expect(store.getState().activeTabId).toBe(secondId);
	});
});
