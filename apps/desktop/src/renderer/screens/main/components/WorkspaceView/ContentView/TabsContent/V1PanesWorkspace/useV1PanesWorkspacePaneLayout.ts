import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useTabsStore } from "renderer/stores/tabs/store";
import {
	createPaneLayoutSyncer,
	type PaneLayoutSyncer,
} from "./createPaneLayoutSyncer";
import { seedPanesFromV1Tabs } from "./seedPanesFromV1Tabs";
import type { V1PanesPaneData } from "./types";

const EMPTY_STATE: WorkspaceState<V1PanesPaneData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

/**
 * v1-panes-in-v1 persistence adapter.
 *
 * Modeled on `useV2WorkspacePaneLayout` (the v2 workspace's pane-layout
 * persistence), but living inside the v1 shell and writing to the same
 * `v2WorkspaceLocalState` TanStack DB collection v2 uses. Sharing the
 * collection gives free per-workspace isolation (row keyed by workspaceId)
 * and a single source of truth the future v2 base can read unchanged.
 *
 * The sync core (`createPaneLayoutSyncer`) is a pure, testable function;
 * this hook only wires it to the collection:
 *
 * - Read: `useLiveQuery` over the workspace's row (cache-first — existing
 *   rows apply immediately; `isLayoutReady` only decides loading vs empty
 *   for write/seed side effects, never the hydrate itself).
 * - Hydrate: an effect calls `syncer.hydrate()` whenever the persisted
 *   layout changes (the syncer's snapshot guard skips no-ops and prevents
 *   echoing back to the collection).
 * - Writeback: `syncer.startWriteback()` subscribes to the store and
 *   writes the `{version,tabs,activeTabId}` projection back to the row
 *   only when it already exists (mirroring v2 — row creation/healing is
 *   the seed migration's job, not the writeback's).
 * - Workspace switch: `syncer.resetSyncMarker()` on workspaceId change so
 *   the new workspace hydrates from its own row without suppression.
 *
 * Unlike v2, this hook takes `workspaceId` as an explicit argument: the
 * v1 shell does not provide v2's `WorkspaceProvider`, so it cannot pull
 * the id from context.
 */
export function useV1PanesWorkspacePaneLayout(workspaceId: string) {
	const collections = useCollections();

	// Keep the volatile pane store scoped to the workspace. Sharing a store
	// across fast workspace switches would let panes leak across worktrees.
	const workspaceRuntime = useMemo(
		() => ({
			workspaceId,
			store: createWorkspaceStore<V1PanesPaneData>({
				initialState: EMPTY_STATE,
			}),
		}),
		[workspaceId],
	);
	const { store } = workspaceRuntime;

	const { data: localWorkspaceRows = [], isReady: isLayoutReady } =
		useLiveQuery(
			(query) =>
				query
					.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
					.where(({ v2WorkspaceLocalState }) =>
						eq(v2WorkspaceLocalState.workspaceId, workspaceId),
					),
			[collections, workspaceId],
		);
	const localWorkspaceState =
		localWorkspaceRows.find((row) => row.workspaceId === workspaceId) ?? null;
	const persistedPaneLayout = useMemo<WorkspaceState<V1PanesPaneData>>(
		() =>
			localWorkspaceState?.workspaceId === workspaceId
				? ((localWorkspaceState.paneLayout as
						| WorkspaceState<V1PanesPaneData>
						| undefined) ?? EMPTY_STATE)
				: EMPTY_STATE,
		[localWorkspaceState, workspaceId],
	);

	// The syncer owns the replaceState/subscribe contract + echo guard.
	// Keep a ref so the effects close over a stable instance per store. The
	// read source is also held in a ref so the syncer can stay a singleton
	// across renders (keeping its subscribe listener attached) while still
	// reading the latest persisted layout on each hydrate.
	const persistedRef = useRef<WorkspaceState<V1PanesPaneData>>(EMPTY_STATE);
	persistedRef.current = persistedPaneLayout;
	const syncerRef = useRef<PaneLayoutSyncer | null>(null);
	if (syncerRef.current === null) {
		syncerRef.current = createPaneLayoutSyncer<V1PanesPaneData>({
			store,
			readPersisted: () => persistedRef.current,
			writePersisted: (next) => {
				if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
				collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
					draft.paneLayout = next;
				});
			},
			emptyState: EMPTY_STATE,
		});
	}
	const syncer = syncerRef.current;

	useEffect(() => {
		syncer.hydrate();
	}, [syncer]);

	useEffect(() => {
		syncer.resetSyncMarker();
		syncer.hydrate();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- workspaceId change only
	}, [syncer]);

	useEffect(() => {
		const stop = syncer.startWriteback();
		return stop;
	}, [syncer]);

	// One-time v1→v2 seed: on first flag-on, when persistence has no layout
	// for this workspace yet, derive an initial layout from the v1 global
	// tabs store so users keep their open terminal. Gated on `isLayoutReady`
	// (cache-first: wait for the collection before deciding "no row" — an
	// unresolved live query is not proof of absence). Writeback persists the
	// seeded layout only if the row already exists; row creation is out of
	// M1 scope (see plan). `seededRef` guards against re-seeding across
	// renders once a seed has been applied for this store.
	const seededRef = useRef(false);
	useEffect(() => {
		if (!isLayoutReady || seededRef.current) return;
		if (persistedPaneLayout.tabs.length > 0) return;
		const seeded = seedPanesFromV1Tabs({
			workspaceId,
			v1TabsState: useTabsStore.getState(),
			persistedPaneLayout,
		});
		if (!seeded) return;
		seededRef.current = true;
		store.getState().replaceState(seeded);
	}, [isLayoutReady, persistedPaneLayout, store, workspaceId]);

	return { store, isLayoutReady };
}
