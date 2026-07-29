import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import type { V1PanesPaneData } from "./types";

/**
 * Minimal slice of the v1 global tabs store that the seed migration reads.
 *
 * The real `useTabsStore` state has more fields (layout, closedTabsStack,
 * etc.), but the seed only needs to find the active workspace's terminal
 * pane. Held as a narrow interface so (a) the function is testable without
 * the global store, and (b) it is not coupled to v1 store internals that
 * may change during the fusion.
 */
export interface V1TabsSeedInput {
	tabs: ReadonlyArray<{ id: string; workspaceId: string }>;
	panes: Readonly<Record<string, { id: string; tabId: string; type: string }>>;
	activeTabIds: Readonly<Record<string, string | null>>;
}

export interface SeedPanesFromV1TabsOptions {
	workspaceId: string;
	v1TabsState: V1TabsSeedInput;
	/**
	 * The persisted `paneLayout` for this workspace, or null when no row
	 * exists yet. A non-empty persisted layout means the workspace was
	 * already migrated (or user already has a layout) → seed returns null.
	 */
	persistedPaneLayout: WorkspaceState<V1PanesPaneData> | null;
	/**
	 * UUID generator for the fallback fresh terminal pane. Injected so
	 * tests are deterministic; the hook passes `crypto.randomUUID`.
	 */
	randomUuid?: () => string;
}

const EMPTY_STATE: WorkspaceState<V1PanesPaneData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

/**
 * One-time v1→v2 panes seed migration.
 *
 * On first flag-on, when there is no persisted `paneLayout` for a
 * workspace, derive an initial `WorkspaceState` from the v1 global tabs
 * store so users keep their open terminal. Returns the seeded state, or
 * `null` when the workspace was already migrated (non-empty persisted
 * layout present — the idempotency guard).
 *
 * Source pane: the active tab's first `type === "terminal"` pane, falling
 * back to the workspace's first terminal pane (across all its tabs). The
 * seeded pane's `data.terminalId` is set to the v1 pane's `id` so the
 * existing host-service terminal session — which the v1 host-service
 * adapter keys by paneId — survives the migration. If the workspace has
 * no terminal pane at all, seed one fresh terminal (UUID) so the
 * workspace is never empty.
 *
 * Pure: input → output. Takes the v1 tabs state as an argument rather
 * than reading `useTabsStore` directly so it is testable without the
 * global store, and so the hook can decide when (and whether) to write
 * the result back to the `v2WorkspaceLocalState` collection.
 */
export function seedPanesFromV1Tabs(
	options: SeedPanesFromV1TabsOptions,
): WorkspaceState<V1PanesPaneData> | null {
	const { workspaceId, v1TabsState, persistedPaneLayout, randomUuid } = options;

	// Idempotency: a non-empty persisted layout means "already migrated".
	if (persistedPaneLayout && persistedPaneLayout.tabs.length > 0) {
		return null;
	}

	const sourcePane = findSourceTerminalPane(workspaceId, v1TabsState);
	// `crypto.randomUUID` requires its Web Crypto receiver in Electron, so do
	// not detach it through a nullish-coalesced callback.
	const terminalId = sourcePane?.id ?? randomUuid?.() ?? crypto.randomUUID();

	const store = createWorkspaceStore<V1PanesPaneData>({
		initialState: EMPTY_STATE,
	});
	store.getState().addTab({
		panes: [{ kind: "terminal", data: { terminalId } }],
	});

	const state = store.getState();
	return {
		version: state.version,
		tabs: state.tabs,
		activeTabId: state.activeTabId,
	};
}

/**
 * Find the v1 pane whose terminalId the seed should reuse: the active
 * tab's first terminal pane, falling back to the workspace's first
 * terminal pane. Returns null when the workspace has no terminal pane.
 */
function findSourceTerminalPane(
	workspaceId: string,
	state: V1TabsSeedInput,
): { id: string } | null {
	const workspaceTabs = state.tabs.filter(
		(tab) => tab.workspaceId === workspaceId,
	);
	const activeTabId = state.activeTabIds[workspaceId] ?? null;

	const terminalPaneOfTab = (tabId: string): { id: string } | null => {
		for (const pane of Object.values(state.panes)) {
			if (pane.tabId === tabId && pane.type === "terminal") {
				return { id: pane.id };
			}
		}
		return null;
	};

	// 1. Active tab's first terminal pane.
	if (activeTabId) {
		const active = terminalPaneOfTab(activeTabId);
		if (active) return active;
	}

	// 2. Fallback: first terminal pane across the workspace's tabs, in tab order.
	for (const tab of workspaceTabs) {
		if (tab.id === activeTabId) continue;
		const fallback = terminalPaneOfTab(tab.id);
		if (fallback) return fallback;
	}

	return null;
}
