import type { RendererContext, Tab, WorkspaceStore } from "@superset/panes";
import type { SessionStatus } from "@superset/session-protocol";
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

/**
 * Reconcile ACP pane status against the workspace-level ACP session snapshot.
 * The tab-strip status accessory reads `pane.data.acp.status`, so writes
 * from `AcpSessionPane.onSessionMetadataChange` alone would stall until the
 * user opens that tab — this sync runs at the workspace level and keeps the
 * tab badge in step with the sidebar's aggregate red dot.
 */
export function syncV1PanesAcpStatuses(
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>,
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

export function getV1PanesTabStatus(
	tab: Tab<V1PanesPaneData>,
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

/** Maps protocol session state onto the shared tab/sidebar status vocabulary.
 *
 * `offline` is a dormant state — the session is persisted on the host but no
 * adapter is attached, and any live-path call resurrects it. It is not a
 * failure the user must act on, so it maps to `idle` (no indicator). Only
 * `dead` — a session that actually crashed — shows the red "failed" dot.
 */
export function acpSessionStatusToPaneStatus(
	status: SessionStatus | undefined,
): PaneStatus {
	switch (status) {
		case "running":
		case "starting":
			return "working";
		case "awaiting_permission":
			return "permission";
		case "dead":
			return "failed";
		default:
			return "idle";
	}
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
