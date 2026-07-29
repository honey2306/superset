import { describe, expect, mock, test } from "bun:test";
import type { PaneDefinition, RendererContext } from "@superset/panes";
import { createWorkspaceStore } from "@superset/panes";
import { buildV1PanesLifecycleRegistry } from "./buildV1PanesLifecycleRegistry";
import {
	commentPaneTitle,
	devtoolsPaneTitle,
	type NonTerminalPaneTitles,
	webviewPaneTitle,
} from "./buildV1PanesNonTerminalRegistry";
import type { V1PanesPaneData } from "./types";

// Stub `terminalRuntimeRegistry` for the lifecycle registry tests below.
// The real registry's module graph pulls the Electron tRPC client at load
// time; the onAfterClose behaviors under test do not depend on it. The
// PoC wiring tests use a local `buildRegistry()` clone and never touch this.
const terminalRuntimeStub = {
	onTitleChange: () => () => {},
	getTitle: () => undefined,
};

const probeRunningStub = async () => false;
const closeConfirmLabels = {
	title: "Close terminal?",
	description: "A process is still running",
	confirmLabel: "Close",
} as const;

/**
 * PoC wiring tests for the v2-panes-in-v1 mount.
 *
 * These tests do NOT render React. They exercise the pure wiring that
 * `useV1PanesWorkspace` relies on: that a `@superset/panes` store can be
 * created, seeded with a terminal tab, and that the registry's
 * `renderPane`/`titleSource` callbacks are callable against a pane produced by
 * the store. The runtime question this PoC must answer is "can the panes
 * engine host the neutral terminal layer inside the v1 shell" — these tests
 * lock the adapter contract that makes that possible.
 */

// Mirror the registry shape produced by useV1PanesRegistry, but without the
// HostServiceTerminalPane JSX import (which needs the renderer). The contract
// under test is the PaneDefinition callback signatures, not the rendered JSX.
function buildRegistry(): Record<string, PaneDefinition<V1PanesPaneData>> {
	return {
		terminal: {
			getTitle: () => "Terminal",
			titleSource: (pane) => {
				const { terminalId } = pane.data;
				return {
					subscribe: () => () => {},
					getSnapshot: () => terminalId,
				};
			},
			renderPane: (ctx: RendererContext<V1PanesPaneData>) => {
				// The PoC passes ctx.pane.id as paneId and ctx.tab.id as tabId
				// to HostServiceTerminalPane. Return the contract so the test
				// can assert the identity mapping without importing the pane.
				return ctx.pane.data.terminalId as unknown as React.ReactNode;
			},
		},
		"file-viewer": {
			getTitle: (pane) => pane.data.fileViewer?.filePath,
			renderPane: (ctx) =>
				(ctx.pane.data.fileViewer?.filePath ??
					"no-file") as unknown as React.ReactNode,
		},
		comment: {
			getTitle: (pane) => commentPaneTitle(pane.data),
			renderPane: (ctx) =>
				(ctx.pane.data.comment?.authorLogin ??
					"no-comment") as unknown as React.ReactNode,
		},
		devtools: {
			getTitle: () => devtoolsPaneTitle(nonTerminalLabels),
			renderPane: (ctx) =>
				(ctx.pane.data.devtools?.targetPaneId ??
					"no-target") as unknown as React.ReactNode,
		},
		webview: {
			getTitle: (pane) => webviewPaneTitle(pane.data, nonTerminalLabels),
			renderPane: (ctx) =>
				(ctx.pane.data.browser?.currentUrl ??
					"no-url") as unknown as React.ReactNode,
		},
	};
}

const nonTerminalLabels: NonTerminalPaneTitles = {
	devtools: "DevTools",
	browser: "Browser",
};

describe("V1PanesWorkspace PoC wiring", () => {
	test("a panes store can be created and seeded with one terminal tab", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();
		store.getState().addTab({
			panes: [
				{
					kind: "terminal",
					data: { terminalId: "term-1" },
				},
			],
		});

		const state = store.getState();
		expect(state.tabs).toHaveLength(1);
		expect(state.activeTabId).toBe(state.tabs[0]?.id);
		// panes live inside the tab, not at the workspace root.
		const tab = state.tabs[0];
		expect(tab).toBeDefined();
		const paneKeys = Object.keys(tab.panes);
		expect(paneKeys).toHaveLength(1);
		const pane = tab.panes[paneKeys[0] ?? ""];
		expect(pane?.kind).toBe("terminal");
		expect(pane?.data.terminalId).toBe("term-1");
	});

	test("the terminal registry produces a PaneDefinition with the right callbacks", () => {
		const registry = buildRegistry();
		const def = registry.terminal;
		expect(typeof def.renderPane).toBe("function");
		const fakePane = {
			id: "pane-1",
			kind: "terminal",
			data: { terminalId: "term-1" },
		} as never;
		expect(def.getTitle?.(fakePane)).toBe("Terminal");

		// titleSource must return a subscribe/getSnapshot pair so the tab
		// title can react to terminalRuntimeRegistry.onTitleChange.
		const source = def.titleSource?.(fakePane);
		expect(typeof source?.subscribe).toBe("function");
		expect(typeof source?.getSnapshot).toBe("function");
		expect(source?.getSnapshot?.()).toBe("term-1");
		const unsub = source?.subscribe(() => {});
		expect(typeof unsub).toBe("function");
		unsub?.();
	});

	test("renderPane receives the panes ctx with pane.id and tab.id mapped for the v1 terminal layer", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();
		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "term-1" } }],
		});
		const state = store.getState();
		const tab = state.tabs[0];
		expect(tab).toBeDefined();
		const pane = tab.panes[Object.keys(tab.panes)[0] ?? ""];

		// Simulate what @superset/panes' <Workspace/> does: call renderPane
		// with a RendererContext carrying the store, tab, and pane.
		const ctx = {
			store,
			tab,
			pane,
		} as RendererContext<V1PanesPaneData>;

		// The PoC's renderPane must be callable; the real component would
		// receive ctx.pane.id (paneId) and ctx.tab.id (tabId). We assert the
		// identity values exist on the ctx the panes engine will hand us.
		expect(ctx.pane.id).toBe(pane.id);
		expect(ctx.tab.id).toBe(tab.id);

		const def = buildRegistry().terminal;
		expect(() => def.renderPane(ctx)).not.toThrow();
	});

	test("addPane splits a second terminal pane into the active tab", () => {
		const store = createWorkspaceStore<V1PanesPaneData>();
		const state = store.getState();
		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "term-1" } }],
		});
		const activeTab = state.getActiveTab();
		expect(activeTab).toBeDefined();
		if (!activeTab) return;

		store.getState().addPane({
			tabId: activeTab.id,
			pane: { kind: "terminal", data: { terminalId: "term-2" } },
			position: "right",
		});

		const next = store.getState();
		const nextTab = next.tabs[0];
		expect(nextTab).toBeDefined();
		expect(Object.keys(nextTab.panes)).toHaveLength(2);
		expect(next.tabs).toHaveLength(1);
		// The tab's layout is a split node now, not a bare pane.
		expect(nextTab.layout.type).toBe("split");
	});
});

describe("V1PanesWorkspace multi-kind registry", () => {
	// The M3 gate: the panes registry must register every migrated v1 pane
	// kind, not just terminal, so opening a file/chat/comment/devtools/webview
	// pane under `V2_PANES_IN_V1` renders instead of "Unknown pane kind". This
	// locks
	// the registry SHAPE (which kinds exist) and the title delegation; the
	// per-kind title derivation is covered by
	// `buildV1PanesNonTerminalRegistry.test.ts`.
	test("the registry registers all migrated v1 pane kinds", () => {
		const registry = buildRegistry();
		expect(Object.keys(registry).sort()).toEqual([
			"comment",
			"devtools",
			"file-viewer",
			"terminal",
			"webview",
		]);
	});

	test("each kind exposes a callable renderPane", () => {
		const registry = buildRegistry();
		const store = createWorkspaceStore<V1PanesPaneData>();
		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "t" } }],
		});
		const state = store.getState();
		const ctx = {
			store,
			tab: state.tabs[0],
			pane: state.tabs[0].panes[Object.keys(state.tabs[0].panes)[0] ?? ""],
		} as RendererContext<V1PanesPaneData>;
		for (const kind of Object.keys(registry)) {
			expect(typeof registry[kind].renderPane).toBe("function");
			expect(() => registry[kind].renderPane(ctx)).not.toThrow();
		}
	});

	test("comment getTitle delegates to commentPaneTitle", () => {
		const def = buildRegistry().comment;
		const pane = {
			id: "p",
			kind: "comment",
			data: {
				terminalId: "t",
				comment: { commentId: "c", authorLogin: "octocat", body: "" },
			},
		} as never;
		expect(def.getTitle?.(pane)).toBe("@octocat");
	});

	test("devtools getTitle delegates to devtoolsPaneTitle", () => {
		const def = buildRegistry().devtools;
		const pane = {
			id: "p",
			kind: "devtools",
			data: { terminalId: "t" },
		} as never;
		expect(def.getTitle?.(pane)).toBe("DevTools");
	});

	test("webview getTitle delegates to webviewPaneTitle", () => {
		const def = buildRegistry().webview;
		const pane = {
			id: "p",
			kind: "webview",
			data: {
				terminalId: "t",
				browser: {
					currentUrl: "https://example.com",
					history: [],
					historyIndex: 0,
					isLoading: false,
				},
			},
		} as never;
		expect(def.getTitle?.(pane)).toBe("example.com");
	});
});

describe("V1PanesWorkspace terminal onAfterClose wiring", () => {
	test("closing a terminal pane calls killTerminal with the pane id", () => {
		const killTerminal = mock<(paneId: string) => void>();
		const lifecycle = buildV1PanesLifecycleRegistry({
			terminalRuntime: terminalRuntimeStub,
			killTerminal,
			probeRunning: probeRunningStub,
			closeConfirmLabels,
		});
		const pane = {
			id: "pane-1",
			kind: "terminal",
			data: { terminalId: "term-1" },
		} as never;

		lifecycle.onAfterClose?.(pane);

		expect(killTerminal).toHaveBeenCalledTimes(1);
		expect(killTerminal).toHaveBeenCalledWith("pane-1");
	});

	test("onAfterClose uses pane.id, not pane.data.terminalId, for the kill key", () => {
		const killTerminal = mock<(paneId: string) => void>();
		const lifecycle = buildV1PanesLifecycleRegistry({
			terminalRuntime: terminalRuntimeStub,
			killTerminal,
			probeRunning: probeRunningStub,
			closeConfirmLabels,
		});
		// terminalId intentionally differs from pane.id — the identity rule
		// says paneId (UI identity) ≠ terminalId (backend identity), and the
		// kill must be keyed by the UI identity the host-service adapter
		// derives from (paneId), not the stored terminalId.
		const pane = {
			id: "pane-1",
			kind: "terminal",
			data: { terminalId: "different-backend-id" },
		} as never;

		lifecycle.onAfterClose?.(pane);

		expect(killTerminal).toHaveBeenCalledWith("pane-1");
		expect(killTerminal).not.toHaveBeenCalledWith("different-backend-id");
	});
});
