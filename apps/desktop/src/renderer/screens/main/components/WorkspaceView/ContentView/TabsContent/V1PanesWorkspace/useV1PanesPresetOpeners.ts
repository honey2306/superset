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
 * The hook applies the pure `planV1PanesPresetOpen` to the panes store:
 * `new-tab` → `store.addTab`, `active-tab` → `store.splitPane` (right) in
 * the active tab. The preset's commands become the new terminal's
 * `initialCommand` (host-service `createSession` runs them on spawn) and
 * the preset's `cwd` becomes the session `initialCwd`.
 *
 * M2 scope: single-pane terminal launch only. v1's multi-command
 * parallel / sequential / new-tab-per-command execution modes are a
 * fidelity follow-up.
 */
export function useV1PanesPresetOpeners(
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>,
) {
	const openPreset = useCallback(
		(
			preset: Pick<TerminalPreset, "commands" | "cwd" | "name">,
			options: { target: V1PanesPresetTarget },
		) => {
			const state = store.getState();
			const activeTabId = state.activeTabId;
			const plan = planV1PanesPresetOpen(preset, {
				target: options.target,
				activeTabId,
			});
			if (plan.kind === "addTab") {
				state.addTab({
					titleOverride: plan.titleOverride,
					panes: [
						{
							kind: "terminal",
							titleOverride: plan.titleOverride,
							data: {
								terminalId: plan.terminalId,
								initialCommand: plan.initialCommand,
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
								initialCommand: plan.initialCommand,
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
						initialCommand: plan.initialCommand,
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

	return { openPreset, addTerminalTab };
}

export type V1PanesPresetOpeners = ReturnType<typeof useV1PanesPresetOpeners>;
