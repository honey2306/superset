import type { WorkspaceState } from "@superset/panes";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { logStressEvent } from "renderer/lib/performance/stress-instrumentation";
import { useLocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider";
import { getVisibleSidebarWorkspaces } from "renderer/routes/_local/providers/LocalProductStateProvider/dashboardSidebarLocal";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import {
	getResourceMonitorRefetchInterval,
	shouldQueryResourceMonitor,
} from "../../resourceConsumptionPolicy";
import type { ResourceMetricsSnapshot } from "../../types";
import { normalizeResourceMetricsSnapshot } from "../../utils/normalizeSnapshot";

function getTerminalIdFromPaneData(data: unknown): string | null {
	if (!data || typeof data !== "object") return null;
	const terminalId = (data as { terminalId?: unknown }).terminalId;
	return typeof terminalId === "string" && terminalId.length > 0
		? terminalId
		: null;
}

function getTerminalTitleOverrides(
	rows: Array<{ paneLayout: unknown }>,
): Map<string, string> {
	const overrides = new Map<string, string>();
	for (const row of rows) {
		const layout = row.paneLayout as WorkspaceState<unknown> | undefined;
		if (!Array.isArray(layout?.tabs)) continue;
		for (const tab of layout.tabs) {
			if (!tab.panes || typeof tab.panes !== "object") continue;
			for (const pane of Object.values(tab.panes)) {
				if (pane.kind !== "terminal" || !pane.titleOverride) continue;
				const terminalId = getTerminalIdFromPaneData(pane.data);
				if (terminalId && !overrides.has(terminalId))
					overrides.set(terminalId, pane.titleOverride);
			}
		}
	}
	return overrides;
}

export interface UseResourceSnapshotResult {
	snapshot: ResourceMetricsSnapshot | null;
	refetch: () => void;
	isFetching: boolean;
	sidebarProjectOrder: string[];
	sidebarWorkspaceOrder: string[];
}

export function useResourceSnapshot(): UseResourceSnapshotResult {
	const collections = useLocalCollections();
	const { data: rawSidebarProjects = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sp: collections.sidebarProjects })
				.orderBy(({ sp }) => sp.tabOrder, "asc")
				.select(({ sp }) => ({ projectId: sp.projectId })),
		[collections],
	);
	const { data: rawSidebarWorkspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ ws: collections.workspaceLocalState })
				.orderBy(({ ws }) => ws.sidebarState.tabOrder, "asc")
				.select(({ ws }) => ({
					workspaceId: ws.workspaceId,
					isHidden: ws.sidebarState.isHidden,
					paneLayout: ws.paneLayout,
				})),
		[collections],
	);
	const sidebarProjectOrder = useMemo(
		() => rawSidebarProjects.map((project) => project.projectId),
		[rawSidebarProjects],
	);
	const sidebarWorkspaceOrder = useMemo(
		() =>
			getVisibleSidebarWorkspaces(rawSidebarWorkspaces).map(
				(workspace) => workspace.workspaceId,
			),
		[rawSidebarWorkspaces],
	);
	const terminalTitleOverrides = useMemo(
		() => getTerminalTitleOverrides(rawSidebarWorkspaces),
		[rawSidebarWorkspaces],
	);
	const { projects: hostProjects } = useWorkspaceCatalog();
	const rawProjects = useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.id,
				name: project.name,
			})),
		[hostProjects],
	);
	const { workspaces: rawWorkspaces } = useWorkspaceCatalog();
	const {
		data: snapshot,
		refetch,
		isFetching,
	} = electronTrpc.resourceMetrics.getSnapshot.useQuery(
		{ mode: "interactive" },
		{
			enabled: shouldQueryResourceMonitor({ enabled: true, open: true }),
			refetchInterval: getResourceMonitorRefetchInterval(true),
		},
	);
	useEffect(() => {
		if (isFetching)
			logStressEvent("resource-monitor.fetch", { surface: "host" });
	}, [isFetching]);
	const normalizedSnapshot = useMemo(() => {
		const normalized = normalizeResourceMetricsSnapshot(snapshot);
		if (!normalized) return normalized;
		const projectById = new Map(
			rawProjects.map((project) => [project.id, project]),
		);
		const workspaceById = new Map(
			rawWorkspaces.map((workspace) => [workspace.id, workspace]),
		);
		return {
			...normalized,
			workspaces: normalized.workspaces.map((workspace) => {
				const catalogWorkspace = workspaceById.get(workspace.workspaceId);
				const projectId = catalogWorkspace?.projectId ?? workspace.projectId;
				const project = projectById.get(projectId);
				return {
					...workspace,
					projectId,
					projectName: project?.name ?? workspace.projectName,
					workspaceName: catalogWorkspace?.name ?? workspace.workspaceName,
					sessions: workspace.sessions.map((entry) => ({
						...entry,
						title:
							terminalTitleOverrides.get(entry.paneId) ?? entry.title ?? null,
					})),
				};
			}),
		};
	}, [snapshot, rawProjects, rawWorkspaces, terminalTitleOverrides]);
	return {
		snapshot: normalizedSnapshot,
		refetch,
		isFetching,
		sidebarProjectOrder,
		sidebarWorkspaceOrder,
	};
}
