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
import { mergeAcpPaneTitles } from "./acpPaneTitles";
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
 * Reconcile ACP pane status and title against the workspace-level session
 * snapshot. Writes from `AcpSessionPane.onSessionMetadataChange` alone stall
 * until the user opens that tab, so this keeps inactive tab titles and status
 * indicators current without mounting their pane content.
 */
export function syncPanesAcpStatuses(
	store: StoreApi<WorkspaceStore<PanesPaneData>>,
	statuses: ReadonlyMap<string, SessionStatus>,
	notificationStatuses?: ReadonlyMap<string, PaneStatus>,
	titles?: ReadonlyMap<string, string | null>,
): void {
	for (const tab of store.getState().tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "acp") continue;
			const acp = pane.data.acp;
			if (!acp) continue;
			const nextStatus = statuses.get(acp.sessionId);
			if (nextStatus === undefined) continue;
			const nextNotificationStatus = notificationStatuses
				? notificationStatuses.get(acp.sessionId)
				: acp.notificationStatus;
			const hasTitleUpdate = titles?.has(acp.sessionId) ?? false;
			const nextTitles = hasTitleUpdate
				? mergeAcpPaneTitles(acp, titles?.get(acp.sessionId) ?? null)
				: { title: acp.title, statusTitle: acp.statusTitle };
			if (
				acp.status === nextStatus &&
				acp.notificationStatus === nextNotificationStatus &&
				acp.title === nextTitles.title &&
				acp.statusTitle === nextTitles.statusTitle
			)
				continue;
			store.getState().setPaneData({
				paneId: pane.id,
				data: {
					...pane.data,
					acp: {
						...acp,
						status: nextStatus,
						notificationStatus: nextNotificationStatus,
						...nextTitles,
					},
				},
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
					? (pane.data.acp?.notificationStatus ??
						acpSessionStatusToPaneStatus(pane.data.acp?.status))
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
