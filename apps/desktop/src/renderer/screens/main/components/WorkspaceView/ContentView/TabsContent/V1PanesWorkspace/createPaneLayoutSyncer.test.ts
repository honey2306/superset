import { describe, expect, test } from "bun:test";
import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import { createPaneLayoutSyncer } from "./createPaneLayoutSyncer";
import type { V1PanesPaneData } from "./types";

const EMPTY_STATE: WorkspaceState<V1PanesPaneData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

/**
 * The syncer is the pure, testable core of the v1-panes-in-v1 persistence
 * adapter. It owns the replaceState/subscribe contract against a
 * `@superset/panes` store and a snapshot guard that breaks the read↔write
 * echo loop. The hook (`useV1PanesWorkspacePaneLayout`) wires it to the
 * `v2WorkspaceLocalState` TanStack DB collection; these tests inject an
 * in-memory read/write pair so the sync behavior is verifiable without
 * the collection/Electron environment.
 */
describe("createPaneLayoutSyncer", () => {
	test("hydrates the store from persisted layout on hydrate()", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();
		const persisted: WorkspaceState<V1PanesPaneData> = {
			version: 1,
			tabs: [],
			activeTabId: null,
		};
		// Seed one tab in persisted so hydrate is observable.
		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "term-1" } }],
		});
		const seededSnapshot = store.getState();
		const persistedLayout: WorkspaceState<V1PanesPaneData> = {
			version: seededSnapshot.version,
			tabs: seededSnapshot.tabs,
			activeTabId: seededSnapshot.activeTabId,
		};
		store.getState().replaceState(EMPTY_STATE);

		const readValue: WorkspaceState<V1PanesPaneData> | null = persistedLayout;
		const writeCalls: WorkspaceState<V1PanesPaneData>[] = [];
		const syncer = createPaneLayoutSyncer<V1PanesPaneData>({
			store,
			readPersisted: () => readValue,
			writePersisted: (next) => {
				writeCalls.push(next);
			},
			emptyState: EMPTY_STATE,
		});

		syncer.hydrate();

		const state = store.getState();
		expect(state.tabs).toHaveLength(1);
		expect(state.activeTabId).toBe(persistedLayout.activeTabId);
		// Hydrating from persisted must not echo back to writePersisted.
		expect(writeCalls).toHaveLength(0);
		void persisted;
	});

	test("a store mutation writes back the {version,tabs,activeTabId} projection", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();
		const writeCalls: WorkspaceState<V1PanesPaneData>[] = [];
		const syncer = createPaneLayoutSyncer<V1PanesPaneData>({
			store,
			readPersisted: () => null,
			writePersisted: (next) => {
				writeCalls.push(next);
			},
			emptyState: EMPTY_STATE,
		});
		syncer.hydrate();
		syncer.startWriteback();

		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "term-1" } }],
		});

		expect(writeCalls.length).toBeGreaterThanOrEqual(1);
		const last = writeCalls[writeCalls.length - 1];
		expect(last).toBeDefined();
		expect(last?.tabs).toHaveLength(1);
		expect(last?.version).toBe(1);
		expect(last?.activeTabId).toBe(store.getState().activeTabId);
	});

	test("a replaceState hydration does not trigger a writeback echo", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();
		const writeCalls: WorkspaceState<V1PanesPaneData>[] = [];
		const syncer = createPaneLayoutSyncer<V1PanesPaneData>({
			store,
			// Pretend a fresh persisted value arrives each hydrate.
			readPersisted: () => ({
				version: 1,
				tabs: [],
				activeTabId: null,
			}),
			writePersisted: (next) => {
				writeCalls.push(next);
			},
			emptyState: EMPTY_STATE,
		});
		syncer.startWriteback();
		syncer.hydrate();

		// Hydrate calls replaceState internally; the snapshot guard must
		// suppress the writeback that would otherwise echo it.
		expect(writeCalls).toHaveLength(0);
	});

	test("does not replace a local tab with a stale persisted snapshot", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();
		let persisted: WorkspaceState<V1PanesPaneData> = EMPTY_STATE;
		const syncer = createPaneLayoutSyncer<V1PanesPaneData>({
			store,
			readPersisted: () => persisted,
			writePersisted: () => {},
			emptyState: EMPTY_STATE,
		});
		syncer.startWriteback();
		syncer.hydrate();

		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "term-1" } }],
		});
		// A collection observer can still emit its cached pre-write row here.
		syncer.hydrate(persisted);

		expect(store.getState().tabs).toHaveLength(1);

		persisted = {
			version: store.getState().version,
			tabs: store.getState().tabs,
			activeTabId: store.getState().activeTabId,
		};
		syncer.hydrate(persisted);
		expect(store.getState().tabs).toHaveLength(1);
	});

	test("resetSyncMarker prevents the next hydrate from being suppressed as an echo", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();
		let readValue: WorkspaceState<V1PanesPaneData> | null = null;
		const syncer = createPaneLayoutSyncer<V1PanesPaneData>({
			store,
			readPersisted: () => readValue,
			writePersisted: () => {},
			emptyState: EMPTY_STATE,
		});
		syncer.hydrate(); // hydrates EMPTY, snapshot now = EMPTY

		// Simulate a workspace switch: persisted changes + marker resets.
		readValue = {
			version: 1,
			tabs: [],
			activeTabId: null,
		};
		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "term-2" } }],
		});
		const seeded = store.getState();
		readValue = {
			version: seeded.version,
			tabs: seeded.tabs,
			activeTabId: seeded.activeTabId,
		};
		store.getState().replaceState(EMPTY_STATE);

		syncer.resetSyncMarker();
		syncer.hydrate();

		expect(store.getState().tabs).toHaveLength(1);
	});
});
