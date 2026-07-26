import { describe, expect, test } from "bun:test";
import type { WorkspaceState } from "@superset/panes";
import {
	seedPanesFromV1Tabs,
	type V1TabsSeedInput,
} from "./seedPanesFromV1Tabs";
import type { V1PanesPaneData } from "./types";

/**
 * `seedPanesFromV1Tabs` is the one-time v1→v2 panes seed migration: on
 * first flag-on, when there is no persisted `paneLayout` for a workspace,
 * it produces an initial `WorkspaceState` from the v1 global tabs store so
 * users keep their open terminal. The behavior contract:
 *
 * - Idempotent: a non-empty persisted layout means "already migrated" →
 *   return null (caller skips).
 * - Source pane = active tab's first terminal pane, falling back to the
 *   workspace's first terminal pane.
 * - `data.terminalId = v1 pane.id` (so the existing host-service session,
 *   which the adapter keys by paneId, survives).
 * - No terminal pane anywhere → seed one fresh terminal (UUID), matching
 *   the PoC bootstrap so the workspace is never empty.
 *
 * The function is pure (input → output) and takes the v1 tabs state as an
 * argument, so it is testable without the global `useTabsStore`.
 */
describe("seedPanesFromV1Tabs", () => {
	test("returns null when a non-empty persisted layout already exists (idempotent)", () => {
		const v1: V1TabsSeedInput = {
			tabs: [{ id: "tab-1", workspaceId: "ws-1" }],
			panes: {
				"pane-1": { id: "pane-1", tabId: "tab-1", type: "terminal" },
			},
			activeTabIds: { "ws-1": "tab-1" },
		};
		// A persisted layout with a tab means the workspace was already
		// migrated (or the user already has a layout) — seed must not run.
		const persisted: WorkspaceState<V1PanesPaneData> = {
			version: 1,
			tabs: [
				{
					id: "existing-tab",
					titleOverride: undefined,
					createdAt: 0,
					activePaneId: "existing-pane",
					layout: { type: "pane", paneId: "existing-pane" },
					panes: {
						existingPane: {
							id: "existing-pane",
							kind: "terminal",
							data: { terminalId: "existing" },
						},
					},
				},
			],
			activeTabId: "existing-tab",
		};

		const result = seedPanesFromV1Tabs({
			workspaceId: "ws-1",
			v1TabsState: v1,
			persistedPaneLayout: persisted,
		});

		expect(result).toBeNull();
	});

	test("treats a persisted layout with no tabs as not-yet-migrated and seeds", () => {
		const v1: V1TabsSeedInput = {
			tabs: [{ id: "tab-1", workspaceId: "ws-1" }],
			panes: {
				"term-1": { id: "term-1", tabId: "tab-1", type: "terminal" },
			},
			activeTabIds: { "ws-1": "tab-1" },
		};
		// A persisted layout with zero tabs is the empty state — seed runs.
		const persistedEmpty: WorkspaceState<V1PanesPaneData> = {
			version: 1,
			tabs: [],
			activeTabId: null,
		};

		const result = seedPanesFromV1Tabs({
			workspaceId: "ws-1",
			v1TabsState: v1,
			persistedPaneLayout: persistedEmpty,
		});

		expect(result).not.toBeNull();
		const pane = result?.tabs[0]?.panes
			? Object.values(result.tabs[0].panes)[0]
			: undefined;
		expect(pane?.data.terminalId).toBe("term-1");
	});

	test("seeds one tab with one terminal pane from the active tab's first terminal", () => {
		const v1: V1TabsSeedInput = {
			tabs: [
				{ id: "tab-active", workspaceId: "ws-1" },
				{ id: "tab-other", workspaceId: "ws-1" },
			],
			panes: {
				"term-active": {
					id: "term-active",
					tabId: "tab-active",
					type: "terminal",
				},
				"term-other": {
					id: "term-other",
					tabId: "tab-other",
					type: "terminal",
				},
			},
			activeTabIds: { "ws-1": "tab-active" },
		};

		const result = seedPanesFromV1Tabs({
			workspaceId: "ws-1",
			v1TabsState: v1,
			persistedPaneLayout: null,
		});

		expect(result).not.toBeNull();
		expect(result?.tabs).toHaveLength(1);
		const tab = result?.tabs[0];
		expect(tab).toBeDefined();
		const paneKeys = Object.keys(tab?.panes ?? {});
		expect(paneKeys).toHaveLength(1);
		const pane = tab?.panes[paneKeys[0] ?? ""];
		// terminalId must equal the v1 pane id so the existing host-service
		// session (keyed by paneId) survives.
		expect(pane?.data.terminalId).toBe("term-active");
		expect(pane?.kind).toBe("terminal");
		expect(result?.activeTabId).toBe(tab?.id);
	});

	test("falls back to the workspace's first terminal pane when the active tab has none", () => {
		const v1: V1TabsSeedInput = {
			tabs: [
				{ id: "tab-active", workspaceId: "ws-1" },
				{ id: "tab-other", workspaceId: "ws-1" },
			],
			panes: {
				// active tab has a non-terminal pane only
				"file-1": { id: "file-1", tabId: "tab-active", type: "file-viewer" },
				// the other tab has the terminal
				"term-other": {
					id: "term-other",
					tabId: "tab-other",
					type: "terminal",
				},
			},
			activeTabIds: { "ws-1": "tab-active" },
		};

		const result = seedPanesFromV1Tabs({
			workspaceId: "ws-1",
			v1TabsState: v1,
			persistedPaneLayout: null,
		});

		expect(result).not.toBeNull();
		const tab = result?.tabs[0];
		const paneKeys = Object.keys(tab?.panes ?? {});
		const pane = tab?.panes[paneKeys[0] ?? ""];
		expect(pane?.data.terminalId).toBe("term-other");
	});

	test("seeds a fresh terminal pane when the workspace has no terminal pane at all", () => {
		const v1: V1TabsSeedInput = {
			tabs: [{ id: "tab-1", workspaceId: "ws-1" }],
			panes: {
				"file-1": { id: "file-1", tabId: "tab-1", type: "file-viewer" },
			},
			activeTabIds: { "ws-1": "tab-1" },
		};

		const result = seedPanesFromV1Tabs({
			workspaceId: "ws-1",
			v1TabsState: v1,
			persistedPaneLayout: null,
			// Deterministic UUID for the assertion.
			randomUuid: () => "fresh-uuid",
		});

		expect(result).not.toBeNull();
		const tab = result?.tabs[0];
		const paneKeys = Object.keys(tab?.panes ?? {});
		const pane = tab?.panes[paneKeys[0] ?? ""];
		expect(pane?.kind).toBe("terminal");
		expect(pane?.data.terminalId).toBe("fresh-uuid");
	});

	test("ignores panes belonging to other workspaces", () => {
		const v1: V1TabsSeedInput = {
			tabs: [
				{ id: "tab-mine", workspaceId: "ws-1" },
				{ id: "tab-theirs", workspaceId: "ws-2" },
			],
			panes: {
				theirs: {
					id: "theirs",
					tabId: "tab-theirs",
					type: "terminal",
				},
				mine: { id: "mine", tabId: "tab-mine", type: "terminal" },
			},
			// ws-1's active tab is tab-mine
			activeTabIds: { "ws-1": "tab-mine", "ws-2": "tab-theirs" },
		};

		const result = seedPanesFromV1Tabs({
			workspaceId: "ws-1",
			v1TabsState: v1,
			persistedPaneLayout: null,
		});

		const tab = result?.tabs[0];
		const paneKeys = Object.keys(tab?.panes ?? {});
		const pane = tab?.panes[paneKeys[0] ?? ""];
		// Must pick ws-1's terminal, not ws-2's.
		expect(pane?.data.terminalId).toBe("mine");
	});
});
