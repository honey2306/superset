import type { RendererContext, Tab, WorkspaceStore } from "@superset/panes";
import { getHighestPriorityStatus, type PaneStatus } from "shared/tabs-types";
import type { StoreApi } from "zustand/vanilla";
import type {
	HostServiceTerminalPaneBridge,
	HostServiceTerminalPaneSnapshot,
} from "../Terminal/host-service-terminal-pane-bridge";
import type { V1PanesPaneData } from "./types";

export function syncV1PanesTerminalStatuses(
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>,
	statuses: ReadonlyMap<string, PaneStatus>,
): void {
	for (const tab of store.getState().tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "terminal" || !pane.data.terminalId) continue;
			const status = statuses.get(pane.data.terminalId) ?? "idle";
			if (pane.data.status === status) continue;
			store.getState().setPaneData({
				paneId: pane.id,
				data: { ...pane.data, status },
			});
		}
	}
}

export function getV1PanesTabStatus(
	tab: Tab<V1PanesPaneData>,
): ReturnType<typeof getHighestPriorityStatus> {
	return getHighestPriorityStatus(
		Object.values(tab.panes).map((pane) =>
			pane.kind === "terminal" ? pane.data.status : undefined,
		),
	);
}

export function createV1PanesTerminalPaneBridge(
	context: RendererContext<V1PanesPaneData>,
): HostServiceTerminalPaneBridge {
	const { pane, tab, store } = context;

	const getData = (): V1PanesPaneData | null =>
		store.getState().getPane(pane.id)?.pane.data ?? null;

	const updateData = (
		update: (data: V1PanesPaneData) => V1PanesPaneData,
	): void => {
		const data = getData();
		if (!data) return;
		store.getState().setPaneData({
			paneId: pane.id,
			data: update(data),
		});
	};

	return {
		isFocused: context.isActive,
		getSnapshot: (): HostServiceTerminalPaneSnapshot | null => getData(),
		isDestroyed: () => store.getState().getPane(pane.id) === null,
		setTitle: (title) => {
			store.getState().setPaneTitleOverride({
				tabId: tab.id,
				paneId: pane.id,
				titleOverride: title,
			});
		},
		setStatus: (status) => {
			updateData((data) => ({ ...data, status }));
		},
		setCwd: (cwd, cwdConfirmed) => {
			updateData((data) => ({ ...data, cwd, cwdConfirmed }));
		},
		setWorkspaceRunState: (state) => {
			updateData((data) =>
				data.workspaceRun
					? {
							...data,
							workspaceRun: { ...data.workspaceRun, state },
						}
					: data,
			);
		},
		setLifecycleScript: (lifecycleScript) => {
			updateData((data) => ({ ...data, lifecycleScript }));
		},
		clearInitialData: () => {
			updateData((data) => ({
				...data,
				initialCommand: undefined,
				initialCwd: undefined,
			}));
		},
		close: () => {
			store.getState().closePane({ tabId: tab.id, paneId: pane.id });
		},
	};
}
