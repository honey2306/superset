import type { WorkspaceState, WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";

/**
 * Snapshot a `WorkspaceState` for echo-guard comparison. A JSON string is
 * the same shape `useV2WorkspacePaneLayout` uses, and is sufficient because
 * the persisted projection has no non-JSON fields.
 */
function getSnapshot<TData>(state: WorkspaceState<TData>): string {
	return JSON.stringify(state);
}

/**
 * Read side of the persistence backend. Returns the persisted layout, or
 * `null` when there is no persisted row yet. The hook implements this
 * against the `v2WorkspaceLocalState` TanStack DB collection.
 */
export type ReadPersisted<TData> = () => WorkspaceState<TData> | null;

/**
 * Write side of the persistence backend. Receives the persistable
 * projection `{ version, tabs, activeTabId }`. The hook implements this
 * against the `v2WorkspaceLocalState` TanStack DB collection, and only
 * writes when a row already exists (mirroring v2).
 */
export type WritePersisted<TData> = (next: WorkspaceState<TData>) => void;

export interface CreatePaneLayoutSyncerOptions<TData> {
	store: StoreApi<WorkspaceStore<TData>>;
	readPersisted: ReadPersisted<TData>;
	writePersisted: WritePersisted<TData>;
	emptyState: WorkspaceState<TData>;
}

/**
 * The pure, testable core of the v1-panes-in-v1 persistence adapter.
 *
 * Owns the `store.replaceState` / `store.subscribe` contract against a
 * `@superset/panes` store plus a snapshot guard that breaks the read↔write
 * echo loop:
 *
 * - `hydrate()` reads the persisted layout and, if it differs from the
 *   last synced snapshot, calls `store.replaceState(persisted)` and
 *   records the snapshot. A hydration never echoes back to `writePersisted`
 *   because the subscribe listener compares against the same snapshot.
 * - `startWriteback()` subscribes to the store; each mutation projects
 *   `{ version, tabs, activeTabId }` and, if that projection differs from
 *   the last synced snapshot, writes it back and records the snapshot.
 * - `resetSyncMarker()` clears the recorded snapshot so the next
 *   `hydrate()` is applied even when the persisted value would otherwise
 *   equal the marker (e.g. after a workspace switch where both happen to
 *   project to the empty state).
 *
 * The hook wires `readPersisted`/`writePersisted` to the
 * `v2WorkspaceLocalState` collection; this core has no collection/Electron
 * dependencies, so the sync behavior is unit-testable.
 */
export interface PaneLayoutSyncer {
	hydrate: () => void;
	startWriteback: () => () => void;
	resetSyncMarker: () => void;
}

export function createPaneLayoutSyncer<TData>(
	options: CreatePaneLayoutSyncerOptions<TData>,
): PaneLayoutSyncer {
	const { store, readPersisted, writePersisted, emptyState } = options;
	let lastSyncedSnapshot = getSnapshot(emptyState);
	let writebackStarted = false;

	return {
		hydrate: () => {
			const persisted = readPersisted() ?? emptyState;
			const nextSnapshot = getSnapshot(persisted);
			if (nextSnapshot === lastSyncedSnapshot) return;
			lastSyncedSnapshot = nextSnapshot;
			store.getState().replaceState(persisted);
		},
		startWriteback: () => {
			if (writebackStarted) return () => {};
			writebackStarted = true;
			const unsubscribe = store.subscribe((nextStore) => {
				const nextWorkspaceState: WorkspaceState<TData> = {
					version: nextStore.version,
					tabs: nextStore.tabs,
					activeTabId: nextStore.activeTabId,
				};
				const nextSnapshot = getSnapshot(nextWorkspaceState);
				if (nextSnapshot === lastSyncedSnapshot) return;
				lastSyncedSnapshot = nextSnapshot;
				writePersisted(nextWorkspaceState);
			});
			return () => {
				writebackStarted = false;
				unsubscribe();
			};
		},
		resetSyncMarker: () => {
			lastSyncedSnapshot = getSnapshot(emptyState);
		},
	};
}
