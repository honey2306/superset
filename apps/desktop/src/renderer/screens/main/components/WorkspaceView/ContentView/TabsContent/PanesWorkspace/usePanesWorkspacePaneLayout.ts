import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { useLocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider";
import {
	createPaneLayoutSyncer,
	type PaneLayoutSyncer,
} from "./createPaneLayoutSyncer";
import type { PanesPaneData } from "./types";

const EMPTY_STATE: WorkspaceState<PanesPaneData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

/**
 * Host-backed panes persistence adapter.
 *
 * Modeled on `useV2WorkspacePaneLayout` (the v2 workspace's pane-layout
 * persistence), but living inside the v1 shell and writing to the same
 * `workspaceLocalState` TanStack DB collection v2 uses. Sharing the
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
 *   writes the `{version,tabs,activeTabId}` projection back to the existing
 *   row. The first seed creates a row atomically with its initial layout,
 *   after strict collection readiness confirms one is absent.
 * - Workspace switch: `syncer.resetSyncMarker()` on workspaceId change so
 *   the new workspace hydrates from its own row without suppression.
 *
 * Unlike v2, this hook takes `workspaceId` as an explicit argument: the
 * v1 shell does not provide v2's `WorkspaceProvider`, so it cannot pull
 * the id from context.
 */
export function usePanesWorkspacePaneLayout(workspaceId: string) {
	const collections = useLocalCollections();

	// Keep the volatile pane store scoped to the workspace. Sharing a store
	// across fast workspace switches would let panes leak across worktrees.
	const workspaceRuntime = useMemo(
		() => ({
			workspaceId,
			store: createWorkspaceStore<PanesPaneData>({
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
					.from({ workspaceLocalState: collections.workspaceLocalState })
					.where(({ workspaceLocalState }) =>
						eq(workspaceLocalState.workspaceId, workspaceId),
					),
			[collections, workspaceId],
		);
	// `useLiveQuery` can briefly report an empty result while its query changes
	// between workspace ids. Read the collection cache as a fallback: an
	// existing cached layout must win over an empty live-query result, otherwise
	// the seed below creates a new terminal and loses the running session.
	const localWorkspaceState =
		localWorkspaceRows.find((row) => row.workspaceId === workspaceId) ??
		collections.workspaceLocalState.get(workspaceId) ??
		null;
	const persistedPaneLayout = useMemo<WorkspaceState<PanesPaneData>>(
		() =>
			localWorkspaceState?.workspaceId === workspaceId
				? ((localWorkspaceState.paneLayout as
						| WorkspaceState<PanesPaneData>
						| undefined) ?? EMPTY_STATE)
				: EMPTY_STATE,
		[localWorkspaceState, workspaceId],
	);

	// The syncer owns the replaceState/subscribe contract + echo guard. A route
	// switch replaces `store`, so the ref must be scoped to its workspace rather
	// than retained for the component's entire lifetime.
	const persistedRef = useRef<WorkspaceState<PanesPaneData>>(EMPTY_STATE);
	persistedRef.current = persistedPaneLayout;
	const syncerRef = useRef<{
		workspaceId: string;
		syncer: PaneLayoutSyncer;
	} | null>(null);
	if (syncerRef.current?.workspaceId !== workspaceId) {
		syncerRef.current = {
			workspaceId,
			syncer: createPaneLayoutSyncer<PanesPaneData>({
				store,
				readPersisted: () => persistedRef.current,
				writePersisted: (next) => {
					if (!collections.workspaceLocalState.get(workspaceId)) return;
					collections.workspaceLocalState.update(workspaceId, (draft) => {
						draft.paneLayout = next;
					});
				},
				emptyState: EMPTY_STATE,
			}),
		};
	}
	const syncer = syncerRef.current.syncer;

	// The live query is cache-first and can deliver the row after this hook
	// mounts. Re-hydrate for every layout snapshot; otherwise the initial
	// empty cache value leaves a remounted workspace at "No tabs open" even
	// after its persisted panes arrive.
	useEffect(() => {
		syncer.hydrate(persistedPaneLayout);
	}, [syncer, persistedPaneLayout]);

	useEffect(() => {
		syncer.resetSyncMarker();
		syncer.hydrate();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- workspaceId change only
	}, [syncer]);

	useEffect(() => {
		const stop = syncer.startWriteback();
		return stop;
	}, [syncer]);

	return { store, isLayoutReady };
}
