import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { V1PanesPaneData } from "./types";

/**
 * Module-level registry of the active v1-panes stores, keyed by workspace id.
 *
 * Why this exists: the v1 global tabs store (`useTabsStore`) still owns the
 * opener actions that non-content UI invokes — e.g. `ReviewPanel` calls
 * `openCommentPane(workspaceId, comment)` from the right sidebar. When
 * `V2_PANES_IN_V1` owns the view, that action must route into the panes
 * store (the panes engine renders from it), not just the v1 store. The
 * v1 store is a vanilla zustand store and cannot reach a React-scoped
 * panes `StoreApi` through hooks/context, so `V1PanesWorkspace` registers
 * its per-workspace store here on mount and unregisters on unmount; the
 * v1 store action looks the store up by workspace id and calls the pure
 * panes opener (`openCommentInPanesStore`) when one is present.
 *
 * The registry is intentionally tiny and synchronous. It is a bridge
 * surface, not a long-lived cache: a store is present only while its
 * `V1PanesWorkspace` is mounted, so a stale entry cannot outlive the
 * React tree that owned the store. If no store is registered for a
 * workspace (flag off, or the workspace view is not mounted), the v1
 * store action falls back to its existing v1-only behavior.
 */
const v1PanesStores = new Map<
	string,
	StoreApi<WorkspaceStore<V1PanesPaneData>>
>();

/** Register a panes store for a workspace. Called by `V1PanesWorkspace`
 * on mount. Overwriting an existing entry for the same workspace id is a
 * no-op of intent: only one `V1PanesWorkspace` is mounted per workspace at
 * a time, so a second register would indicate a remount, and the new
 * store is the live one. */
export function registerV1PanesStore(
	workspaceId: string,
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>,
): void {
	v1PanesStores.set(workspaceId, store);
}

/** Unregister a panes store. Called by `V1PanesWorkspace` on unmount.
 * Only removes the entry if it still points at the same store, so a
 * remount (register → unregister of the old store after the new one is
 * already registered) does not wipe the live store. */
export function unregisterV1PanesStore(
	workspaceId: string,
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>,
): void {
	if (v1PanesStores.get(workspaceId) === store) {
		v1PanesStores.delete(workspaceId);
	}
}

/** Look up the panes store for a workspace, or `null` when none is mounted
 * (flag off, or the view is not currently mounted). The v1 store opener
 * actions use this to decide whether to route into the panes store. */
export function getV1PanesStore(
	workspaceId: string,
): StoreApi<WorkspaceStore<V1PanesPaneData>> | null {
	return v1PanesStores.get(workspaceId) ?? null;
}
