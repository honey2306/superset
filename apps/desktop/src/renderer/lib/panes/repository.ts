import {
	createWorkspaceStore,
	type WorkspaceState,
	type WorkspaceStore,
} from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PanesPaneData } from "./types";

export type PanesStore = StoreApi<WorkspaceStore<PanesPaneData>>;

export interface DurablePaneLayoutRow {
	workspaceId: string;
	paneLayout: WorkspaceState<PanesPaneData>;
}

type PersistedLayoutUpdater = (
	workspaceId: string,
	update: (
		layout: WorkspaceState<PanesPaneData>,
	) => WorkspaceState<PanesPaneData>,
) => boolean;

const stores = new Map<string, PanesStore>();
const stopWritebacks = new Map<string, () => void>();
const hydratedSnapshots = new Map<string, string>();
const listeners = new Set<() => void>();
let persistedLayoutUpdater: PersistedLayoutUpdater | null = null;
let version = 0;

function snapshot(layout: WorkspaceState<PanesPaneData>): string {
	return JSON.stringify(layout);
}

function emitChange(): void {
	version += 1;
	for (const listener of listeners) listener();
}

function attachWriteback(workspaceId: string, store: PanesStore): void {
	stopWritebacks.get(workspaceId)?.();
	stopWritebacks.set(
		workspaceId,
		store.subscribe((state) => {
			const layout: WorkspaceState<PanesPaneData> = {
				version: state.version,
				tabs: state.tabs,
				activeTabId: state.activeTabId,
			};
			const nextSnapshot = snapshot(layout);
			if (hydratedSnapshots.get(workspaceId) === nextSnapshot) return;
			if (persistedLayoutUpdater?.(workspaceId, () => layout)) {
				hydratedSnapshots.set(workspaceId, nextSnapshot);
			}
		}),
	);
}

export function subscribePanesRepository(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getPanesRepositoryVersion(): number {
	return version;
}

export function configurePanesPersistence(
	updater: PersistedLayoutUpdater | null,
): void {
	persistedLayoutUpdater = updater;
	if (updater) {
		for (const [workspaceId, store] of stores) {
			attachWriteback(workspaceId, store);
		}
	}
}

/**
 * Reconcile durable workspace rows into process-lifetime stores. The route only
 * consumes these stores; it never owns their creation or hydration lifecycle.
 */
export function hydratePanesRepository(
	rows: readonly DurablePaneLayoutRow[],
): void {
	for (const row of rows) {
		let store = stores.get(row.workspaceId);
		if (!store) {
			store = createWorkspaceStore<PanesPaneData>({
				initialState: row.paneLayout,
			});
			stores.set(row.workspaceId, store);
			hydratedSnapshots.set(row.workspaceId, snapshot(row.paneLayout));
			attachWriteback(row.workspaceId, store);
			emitChange();
			continue;
		}
		const nextSnapshot = snapshot(row.paneLayout);
		if (hydratedSnapshots.get(row.workspaceId) === nextSnapshot) continue;
		hydratedSnapshots.set(row.workspaceId, nextSnapshot);
		store.getState().replaceState(() => row.paneLayout);
	}
}

export function registerPanesStore(
	workspaceId: string,
	store: PanesStore,
): () => void {
	stores.set(workspaceId, store);
	attachWriteback(workspaceId, store);
	emitChange();
	return () => unregisterPanesStore(workspaceId, store);
}

export function unregisterPanesStore(
	workspaceId: string,
	store: PanesStore,
): void {
	// Durable repository stores intentionally survive presentation unmounts.
	// Only remove an externally registered store when it is not durable.
	if (
		stores.get(workspaceId) === store &&
		!hydratedSnapshots.has(workspaceId)
	) {
		stores.delete(workspaceId);
		stopWritebacks.get(workspaceId)?.();
		stopWritebacks.delete(workspaceId);
		emitChange();
	}
}

export function getPanesStore(workspaceId: string): PanesStore | null {
	return stores.get(workspaceId) ?? null;
}

/** Durable-row repository API; retained Pane-named alias supports callers. */
export const getWorkspaceStore = getPanesStore;

export function requirePanesStore(workspaceId: string): PanesStore {
	const store = getPanesStore(workspaceId);
	if (!store) {
		throw new Error(`Pane store for workspace ${workspaceId} is not hydrated`);
	}
	return store;
}

export const requireWorkspaceStore = requirePanesStore;

export function findPanesStoreByPaneId(
	paneId: string,
): { workspaceId: string; store: PanesStore } | null {
	for (const [workspaceId, store] of stores) {
		if (store.getState().getPane(paneId)) return { workspaceId, store };
	}
	return null;
}

export function findPanesStoreByTabId(
	tabId: string,
): { workspaceId: string; store: PanesStore } | null {
	for (const [workspaceId, store] of stores) {
		if (store.getState().getTab(tabId)) return { workspaceId, store };
	}
	return null;
}

export function updatePersistedPaneLayout(
	workspaceId: string,
	update: (
		layout: WorkspaceState<PanesPaneData>,
	) => WorkspaceState<PanesPaneData>,
): boolean {
	const store = stores.get(workspaceId);
	if (store) {
		store.getState().replaceState(update);
		return true;
	}
	return persistedLayoutUpdater?.(workspaceId, update) ?? false;
}

export function resetPanesRepositoryForTests(): void {
	for (const stop of stopWritebacks.values()) stop();
	stopWritebacks.clear();
	stores.clear();
	hydratedSnapshots.clear();
	persistedLayoutUpdater = null;
	emitChange();
}
