import {
	createWorkspaceStore,
	type PaneDefinition,
	type RendererContext,
} from "@superset/panes";
import { useCallback, useMemo, useRef, useState } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { HostServiceTerminalPane } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/HostServiceTerminalPane";
import type { V1PanesPaneData } from "./types";

/**
 * PoC registry for the v2-panes-in-v1 mount. Terminal-only.
 *
 * The terminal pane reuses the M0–M5 neutral `HostServiceTerminalPane` so the
 * PoC depends on neither v2 workspace UI nor v2 providers. `ctx.pane.id` is
 * used as the v1 `paneId` and `ctx.tab.id` as the v1 `tabId`, matching the
 * identity contract `HostServiceTerminalPane` already expects.
 *
 * The registry does NOT wire v2's notification/dropdown/header-extras; those
 * are out of PoC scope. The point is to prove the panes engine can host the
 * neutral terminal layer inside the v1 shell.
 */
function useV1PanesRegistry(workspaceId: string) {
	return useMemo<Record<string, PaneDefinition<V1PanesPaneData>>>(() => {
		return {
			terminal: {
				getTitle: () => "Terminal",
				titleSource: (pane) => {
					const { terminalId } = pane.data;
					const instanceId = pane.id;
					return {
						subscribe: (callback) =>
							terminalRuntimeRegistry.onTitleChange(
								terminalId,
								callback,
								instanceId,
							),
						getSnapshot: () =>
							terminalRuntimeRegistry
								.getTitle(terminalId, instanceId)
								?.trim() || undefined,
					};
				},
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
 * PoC store + terminal tab bootstrapping.
 *
 * The store is in-memory only for the PoC (no persistence adapter yet). On
 * first mount it creates a single tab with one terminal pane so the panes
 * engine has something to render. `addTerminalPane` is exposed for ad-hoc
 * split tests during validation.
 */
export function useV1PanesWorkspace(workspaceId: string) {
	const storeRef = useRef<ReturnType<
		typeof createWorkspaceStore<V1PanesPaneData>
	> | null>(null);
	if (storeRef.current === null) {
		storeRef.current = createWorkspaceStore<V1PanesPaneData>();
	}
	const store = storeRef.current;
	const registry = useV1PanesRegistry(workspaceId);

	const [bootstrapped, setBootstrapped] = useState(false);
	if (!bootstrapped) {
		setBootstrapped(true);
		// Seed one tab with a single terminal pane so <Workspace/> renders
		// without the user needing to interact first.
		store.getState().addTab({
			panes: [
				{
					kind: "terminal",
					data: { terminalId: crypto.randomUUID() },
				},
			],
		});
	}

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
