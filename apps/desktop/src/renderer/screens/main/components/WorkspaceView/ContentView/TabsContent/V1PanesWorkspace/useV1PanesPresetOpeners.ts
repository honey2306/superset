import type { TerminalPreset } from "@superset/local-db/schema/zod";
import type { WorkspaceStore } from "@superset/panes";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useHostServiceTerminal } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useHostServiceTerminal";
import { launchTerminalAgent } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/host-service-terminal-agent-launcher";
import type { StoreApi } from "zustand/vanilla";
import {
	planV1PanesPresetOpen,
	type V1PanesPresetTarget,
} from "./planV1PanesPresetOpen";
import { resolveV1PanesPresetLaunch } from "./resolveV1PanesPresetLaunch";
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
 * Built-in terminal agents first launch through host-service `agents.run`,
 * then the pane attaches to that session. Ordinary presets still use
 * `initialCommand`; unavailable agents fall back to their terminal command
 * so the compatibility failure stays visible and testable.
 *
 * M2 scope: single-pane terminal launch only. v1's multi-command
 * parallel / sequential / new-tab-per-command execution modes are a
 * fidelity follow-up.
 */
export function useV1PanesPresetOpeners(
	workspaceId: string,
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>,
) {
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId, staleTime: 30_000 },
	);
	const { hostUrl, hostWorkspaceId } = useHostServiceTerminal({
		workspaceId,
		worktreePath: workspace?.worktreePath,
	});
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
			const launch = await resolveV1PanesPresetLaunch(
				plan,
				async ({ terminalId, agent }) => {
					if (!hostUrl || !hostWorkspaceId) {
						throw new Error("Host terminal backend is not ready");
					}
					await launchTerminalAgent({
						client: getHostServiceClientByUrl(hostUrl),
						workspaceId: hostWorkspaceId,
						paneId: terminalId,
						agent,
						prompt: "",
					});
				},
			);
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
		[hostUrl, hostWorkspaceId, store],
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
