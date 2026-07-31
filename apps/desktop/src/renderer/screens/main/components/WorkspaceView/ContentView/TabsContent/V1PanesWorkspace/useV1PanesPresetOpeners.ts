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
export async function openV1PanesPreset(
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>,
	preset: Pick<TerminalPreset, "commands" | "cwd" | "name">,
	options: { target: V1PanesPresetTarget },
) {
	const state = store.getState();
	const activeTabId = state.activeTabId;
	const activePaneId = state.getActivePane()?.pane.id ?? null;
	const plan = planV1PanesPresetOpen(preset, {
		target: options.target,
		activeTabId,
		activePaneId,
	});
	const initialCommand = plan.agentName
		? plan.fallbackCommand
		: plan.initialCommand;
	const newPane = {
		kind: "terminal",
		titleOverride: plan.titleOverride,
		data: {
			terminalId: plan.terminalId,
			initialCommand,
			initialCwd: plan.initialCwd,
		},
	};
	if (plan.kind === "addTab") {
		state.addTab({
			titleOverride: plan.titleOverride,
			panes: [newPane],
		});
		return;
	}
	if (plan.kind === "replacePane") {
		state.replacePane({
			tabId: plan.tabId,
			paneId: plan.paneId,
			newPane,
		});
		return;
	}
	const activeTab = state.getActiveTab();
	const sourcePaneId =
		state.getActivePane(plan.tabId)?.pane.id ??
		(activeTab ? Object.values(activeTab.panes)[0]?.id : undefined);
	if (!sourcePaneId) {
		state.addTab({
			titleOverride: plan.titleOverride,
			panes: [newPane],
		});
		return;
	}
	state.splitPane({
		tabId: plan.tabId,
		paneId: sourcePaneId,
		position: plan.position,
		newPane,
	});
}

export function useV1PanesPresetOpeners(
	_workspaceId: string,
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>,
) {
	const openPreset = useCallback(
		(
			preset: Pick<TerminalPreset, "commands" | "cwd" | "name">,
			options: { target: V1PanesPresetTarget },
		) => openV1PanesPreset(store, preset, options),
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

	// addBrowserTab removed with internal browser feature
	const addBrowserTab = useCallback(() => {}, []);

	return { openPreset, addTerminalTab, addBrowserTab };
}

export type V1PanesPresetOpeners = ReturnType<typeof useV1PanesPresetOpeners>;
