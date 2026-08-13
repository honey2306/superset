import type { RendererContext, Tab, WorkspaceStore } from "@superset/panes";
import type { SessionStatus } from "@superset/session-protocol";
import { acpSessionStatusToPaneStatus } from "renderer/lib/panes";

export { acpSessionStatusToPaneStatus } from "renderer/lib/panes";

import { getHighestPriorityStatus, type PaneStatus } from "shared/tabs-types";
import type { StoreApi } from "zustand/vanilla";
import type {
	HostServiceTerminalPaneBridge,
	HostServiceTerminalPaneSnapshot,
} from "../Terminal/host-service-terminal-pane-bridge";
import { openFileViewerInPanesStore } from "./openFileViewerInPanesStore";
import type { PanesPaneData } from "./types";

export function syncPanesTerminalStatuses(
	store: StoreApi<WorkspaceStore<PanesPaneData>>,
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

/**
 * Reconcile ACP pane status against the workspace-level ACP session snapshot.
 * The tab-strip status accessory reads `pane.data.acp.status`, so writes
 * from `AcpSessionPane.onSessionMetadataChange` alone would stall until the
 * user opens that tab — this sync runs at the workspace level and keeps the
 * tab badge in step with the sidebar's aggregate red dot.
 */
export function syncPanesAcpStatuses(
	store: StoreApi<WorkspaceStore<PanesPaneData>>,
	statuses: ReadonlyMap<string, SessionStatus>,
): void {
	for (const tab of store.getState().tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "acp") continue;
			const acp = pane.data.acp;
			if (!acp) continue;
			const nextStatus = statuses.get(acp.sessionId);
			if (nextStatus === undefined) continue;
			if (acp.status === nextStatus) continue;
			store.getState().setPaneData({
				paneId: pane.id,
				data: { ...pane.data, acp: { ...acp, status: nextStatus } },
			});
		}
	}
}

export function getPanesTabStatus(
	tab: Tab<PanesPaneData>,
): ReturnType<typeof getHighestPriorityStatus> {
	return getHighestPriorityStatus(
		Object.values(tab.panes).map((pane) =>
			pane.kind === "terminal"
				? pane.data.status
				: pane.kind === "acp"
					? acpSessionStatusToPaneStatus(pane.data.acp?.status)
					: undefined,
		),
	);
}

export function createPanesTerminalPaneBridge(
	context: RendererContext<PanesPaneData>,
): HostServiceTerminalPaneBridge {
	const { pane, tab, store } = context;

	const getData = (): PanesPaneData | null =>
		store.getState().getPane(pane.id)?.pane.data ?? null;

	const updateData = (update: (data: PanesPaneData) => PanesPaneData): void => {
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
		openFileViewer: (options) => {
			openFileViewerInPanesStore(store, options);
		},
		close: () => {
			store.getState().closePane({ tabId: tab.id, paneId: pane.id });
		},
	};
}
