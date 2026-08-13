import type { TerminalPreset } from "@superset/shared/desktop-types";
import { navigatePanes } from "./navigation";
import { getPanesStore, type PanesStore } from "./repository";
import type { PaneNavigationResult, PanesPaneData } from "./types";

export interface PaneLocation {
	tabId: string;
	paneId: string;
	data: PanesPaneData;
}

export function findPane(
	workspaceId: string,
	predicate: (data: PanesPaneData, kind: string) => boolean,
): PaneLocation | null {
	const store = getPanesStore(workspaceId);
	if (!store) return null;
	for (const tab of store.getState().tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (predicate(pane.data, pane.kind)) {
				return { tabId: tab.id, paneId: pane.id, data: pane.data };
			}
		}
	}
	return null;
}

export function focusPane(workspaceId: string, paneId: string): boolean {
	const store = getPanesStore(workspaceId);
	const location = store?.getState().getPane(paneId);
	if (!store || !location) return false;
	store.getState().setActivePane({ tabId: location.tabId, paneId });
	return true;
}

export function updatePaneData(
	workspaceId: string,
	paneId: string,
	update: (data: PanesPaneData) => PanesPaneData,
): boolean {
	const store = getPanesStore(workspaceId);
	const location = store?.getState().getPane(paneId);
	if (!store || !location) return false;
	store.getState().setPaneData({ paneId, data: update(location.pane.data) });
	return true;
}

export function clearWorkspacePaneStatuses(workspaceId: string): boolean {
	const store = getPanesStore(workspaceId);
	if (!store) return false;
	for (const tab of store.getState().tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (!pane.data.status) continue;
			store.getState().setPaneData({
				paneId: pane.id,
				data: { ...pane.data, status: undefined },
			});
		}
	}
	return true;
}

export function closePane(workspaceId: string, paneId: string): boolean {
	const store = getPanesStore(workspaceId);
	const location = store?.getState().getPane(paneId);
	if (!store || !location) return false;
	store.getState().closePane({ tabId: location.tabId, paneId });
	return true;
}

export function addTerminalPane(
	workspaceId: string,
	options: {
		initialCwd?: string;
		initialCommand?: string;
		title?: string;
		data?: Partial<PanesPaneData>;
		dedupeKey?: string;
	} = {},
): PaneNavigationResult<{ tabId: string; paneId: string }> {
	return navigatePanes({
		workspaceId,
		dedupeKey: options.dedupeKey ?? `terminal:${crypto.randomUUID()}`,
		apply: (store) => addTerminalToStore(store, options),
	});
}

export function openPresetInPanes(
	workspaceId: string,
	preset: TerminalPreset,
	options: { target?: "new-tab" | "active-tab" } = {},
): PaneNavigationResult<{ tabId: string; paneIds: string[] }> {
	return navigatePanes({
		workspaceId,
		dedupeKey: `preset:${preset.id}:${options.target ?? "new-tab"}`,
		apply: (store) => {
			const state = store.getState();
			const paneIds = preset.commands.map(() => crypto.randomUUID());
			const panes = preset.commands.map((command, index) => ({
				id: paneIds[index],
				kind: "terminal",
				data: {
					terminalId: paneIds[index],
					initialCommand: command,
					initialCwd: preset.cwd ?? undefined,
				},
			}));
			const activeTab = state.getActiveTab();
			if (options.target === "active-tab" && activeTab) {
				for (const pane of panes) state.addPane({ tabId: activeTab.id, pane });
				return { tabId: activeTab.id, paneIds };
			}
			const tabId = crypto.randomUUID();
			state.addTab({
				id: tabId,
				titleOverride: preset.name,
				panes: panes as [
					(typeof panes)[number],
					...Array<(typeof panes)[number]>,
				],
			});
			return { tabId, paneIds };
		},
	});
}

function addTerminalToStore(
	store: PanesStore,
	options: {
		initialCwd?: string;
		initialCommand?: string;
		title?: string;
		data?: Partial<PanesPaneData>;
	},
): { tabId: string; paneId: string } {
	const tabId = crypto.randomUUID();
	const paneId = crypto.randomUUID();
	store.getState().addTab({
		id: tabId,
		titleOverride: options.title,
		panes: [
			{
				id: paneId,
				kind: "terminal",
				titleOverride: options.title,
				data: {
					...options.data,
					initialCwd: options.initialCwd,
					initialCommand: options.initialCommand,
					terminalId: paneId,
				},
			},
		],
	});
	return { tabId, paneId };
}
