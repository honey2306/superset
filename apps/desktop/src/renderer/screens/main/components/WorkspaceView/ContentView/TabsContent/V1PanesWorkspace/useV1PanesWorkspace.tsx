import type { PaneDefinition, RendererContext } from "@superset/panes";
import { useCallback, useMemo } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { HostServiceTerminalPane } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/HostServiceTerminalPane";
import { killTerminalForPane } from "renderer/stores/tabs/utils/terminal-cleanup";
import { buildV1PanesLifecycleRegistry } from "./buildV1PanesLifecycleRegistry";
import type { V1PanesPaneData } from "./types";
import { useV1PanesWorkspacePaneLayout } from "./useV1PanesWorkspacePaneLayout";

/**
 * v1-panes-in-v1 pane registry. Terminal-only.
 *
 * The lifecycle slice (getTitle/titleSource/onAfterClose) comes from
 * `buildV1PanesLifecycleRegistry`, which takes `terminalRuntimeRegistry`
 * and `killTerminalForPane` as injected deps so it can load in tests.
 * `renderPane` is layered on here because it renders the Electron-only
 * `HostServiceTerminalPane`.
 *
 * `ctx.pane.id` is used as the v1 `paneId` and `ctx.tab.id` as the v1
 * `tabId`, matching the identity contract `HostServiceTerminalPane` expects.
 * `onAfterClose` kills via `killTerminalForPane(pane.id)` — the v1 unified
 * kill entry, which `HostServiceTerminalPane` has already registered its
 * host-service kill against, so the close routes to host-service kill
 * idempotently. The kill is keyed by `pane.id` (UI identity), not
 * `pane.data.terminalId`, matching how `HostServiceTerminalPane` derives
 * its terminalId.
 *
 * The registry does NOT wire v2's notification/dropdown/header-extras; those
 * are out of scope for this fusion phase.
 */
function useV1PanesRegistry(workspaceId: string) {
	return useMemo<Record<string, PaneDefinition<V1PanesPaneData>>>(() => {
		const lifecycle = buildV1PanesLifecycleRegistry({
			terminalRuntime: terminalRuntimeRegistry,
			killTerminal: killTerminalForPane,
		});
		return {
			terminal: {
				...lifecycle,
				renderPane: (ctx: RendererContext<V1PanesPaneData>) => (
					<HostServiceTerminalPane
						paneId={ctx.pane.id}
						tabId={ctx.tab.id}
						workspaceId={workspaceId}
					/>
				),
			},
		};
	}, [workspaceId]);
}

/**
 * Store + registry for the v2-panes-in-v1 mount.
 *
 * The store is backed by `useV1PanesWorkspacePaneLayout`, which persists
 * the panes layout to the shared `v2WorkspaceLocalState` TanStack DB
 * collection (per-workspace row) and performs the one-time v1→v2 seed
 * from the v1 global tabs store on first flag-on — layout survives
 * remount and workspace switch, and users keep their open terminal on
 * first flag-on. `addTerminalPane` is exposed for ad-hoc split tests
 * during validation.
 */
export function useV1PanesWorkspace(workspaceId: string) {
	const { store } = useV1PanesWorkspacePaneLayout(workspaceId);
	const registry = useV1PanesRegistry(workspaceId);

	const addTerminalPane = useCallback(() => {
		const state = store.getState();
		const activeTab = state.getActiveTab();
		if (!activeTab) return;
		state.addPane({
			tabId: activeTab.id,
			pane: {
				kind: "terminal",
				data: { terminalId: crypto.randomUUID() },
			},
			position: "right",
		});
	}, [store]);

	return { store, registry, addTerminalPane };
}
