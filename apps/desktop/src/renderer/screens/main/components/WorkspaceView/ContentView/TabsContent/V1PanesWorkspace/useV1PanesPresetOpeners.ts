import type { TerminalPreset } from "@superset/local-db/schema/zod";
import type { WorkspaceStore } from "@superset/panes";
import { useCallback } from "react";
import type { StoreApi } from "zustand/vanilla";
import {
	planV1PanesPresetOpen,
	type V1PanesPresetTarget,
} from "./planV1PanesPresetOpen";
import type { V1PanesPaneData } from "./types";

/**
 * Unified pane-open entry for the v1-panes mount.
 *
 * Ports v2's `useWorkspacePaneOpeners` shape (a single `openPreset` that
 * writes to the panes store) to the v1 preset model. v1 PresetsBar's
 * `useTabsWithPresets.openPreset` writes to the v1 global tabs store; under
 * the `V2_PANES_IN_V1` flag the panes store owns the view, so preset
 * launch must route here instead. This closes the M1 PresetsBar regression
 * (flag-on replaced `PresetsBar` wholesale).
 *
 * Built-in agents run through the pane's `initialCommand`, just as in v1.
 * This writes the pane before any terminal I/O so a slow host-service RPC
 * cannot make a preset click appear to do nothing.
 *
 * M2 scope: single-pane terminal launch only. v1's multi-command
 * parallel / sequential / new-tab-per-command execution modes are a
 * fidelity follow-up.
 */
export function useV1PanesPresetOpeners(
	_workspaceId: string,
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>,
) {
	const openPreset = useCallback(
		async (
			preset: Pick<TerminalPreset, "commands" | "cwd" | "name">,
			options: { target: V1PanesPresetTarget },
		) => {
			const state = store.getState();
			const activeTabId = state.activeTabId;
			const plan = planV1PanesPresetOpen(preset, {
				target: options.target,
				activeTabId,
			});
			// Add the pane synchronously. Host-side agent launch used to be awaited
			// before this write, leaving the click inert whenever that RPC stalled.
			// The terminal runs the same preset command as v1 once it attaches.
			const launch = {
				initialCommand: plan.agentName
					? plan.fallbackCommand
					: plan.initialCommand,
			};
			if (plan.kind === "addTab") {
				state.addTab({
					titleOverride: plan.titleOverride,
					panes: [
						{
							kind: "terminal",
							titleOverride: plan.titleOverride,
							data: {
								terminalId: plan.terminalId,
								initialCommand: launch.initialCommand,
								initialCwd: plan.initialCwd,
							},
						},
					],
				});
				return;
			}
			const activeTab = state.getActiveTab();
			const sourcePaneId =
				state.getActivePane(plan.tabId)?.pane.id ??
				(activeTab ? Object.values(activeTab.panes)[0]?.id : undefined);
			if (!sourcePaneId) {
				// No pane to split from — fall back to adding a tab.
				state.addTab({
					titleOverride: plan.titleOverride,
					panes: [
						{
							kind: "terminal",
							titleOverride: plan.titleOverride,
							data: {
								terminalId: plan.terminalId,
								initialCommand: launch.initialCommand,
								initialCwd: plan.initialCwd,
							},
						},
					],
				});
				return;
			}
			state.splitPane({
				tabId: plan.tabId,
				paneId: sourcePaneId,
				position: plan.position,
				newPane: {
					kind: "terminal",
					titleOverride: plan.titleOverride,
					data: {
						terminalId: plan.terminalId,
						initialCommand: launch.initialCommand,
						initialCwd: plan.initialCwd,
					},
				},
			});
		},
		[store],
	);

	const addTerminalTab = useCallback(() => {
		store.getState().addTab({
			panes: [
				{
					kind: "terminal",
					data: { terminalId: crypto.randomUUID() },
				},
			],
		});
	}, [store]);

	const addBrowserTab = useCallback(() => {
		const url = "about:blank";
		store.getState().addTab({
			panes: [
				{
					kind: "webview",
					data: {
						browser: {
							currentUrl: url,
							history: [{ url, title: "", timestamp: Date.now() }],
							historyIndex: 0,
							isLoading: false,
						},
					},
				},
			],
		});
	}, [store]);

	return { openPreset, addTerminalTab, addBrowserTab };
}

export type V1PanesPresetOpeners = ReturnType<typeof useV1PanesPresetOpeners>;
