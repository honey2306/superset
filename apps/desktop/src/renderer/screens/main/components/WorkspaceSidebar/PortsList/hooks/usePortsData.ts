import { getEventBus } from "@superset/workspace-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useCatalogWorkspaces } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import type { EnrichedPort } from "shared/types";

const PORTS_FALLBACK_REFETCH_INTERVAL_MS = 10_000;

export interface WorkspacePortGroup {
	workspaceId: string;
	workspaceName: string;
	ports: WorkspacePort[];
}

export interface WorkspacePort extends EnrichedPort {
	hostUrl: string;
	killWorkspaceId: string;
}

function normalizePath(path: string): string {
	return path.replace(/[\\/]+$/, "");
}

export function usePortsData() {
	const { workspaces: allWorkspaces } = useCatalogWorkspaces();
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();

	const hostQueryKey = useMemo(
		() =>
			[
				"host-service-ports",
				activeHostUrl,
				allWorkspaces.map((workspace) => workspace.id),
			] as const,
		[activeHostUrl, allWorkspaces],
	);
	const { data: ports = [] } = useQuery({
		queryKey: hostQueryKey,
		enabled: Boolean(activeHostUrl && allWorkspaces.length),
		refetchInterval: PORTS_FALLBACK_REFETCH_INTERVAL_MS,
		queryFn: async (): Promise<WorkspacePort[]> => {
			if (!activeHostUrl || allWorkspaces.length === 0) return [];
			const client = getHostServiceClientByUrl(activeHostUrl);
			const hostWorkspaces = await client.workspace.list.query();
			const workspaceIdByPath = new Map(
				allWorkspaces
					.filter((workspace) => workspace.worktreePath)
					.map((workspace) => [
						normalizePath(workspace.worktreePath),
						workspace.id,
					]),
			);
			const visibleWorkspaceIdByHostId = new Map(
				hostWorkspaces.flatMap((workspace) => {
					const visibleWorkspaceId = workspaceIdByPath.get(
						normalizePath(workspace.worktreePath),
					);
					return visibleWorkspaceId
						? [[workspace.id, visibleWorkspaceId] as const]
						: [];
				}),
			);
			const workspaceIds = [...visibleWorkspaceIdByHostId.keys()];
			if (workspaceIds.length === 0) return [];
			const hostPorts = await client.ports.getAll.query({ workspaceIds });
			return hostPorts.flatMap((port) => {
				const visibleWorkspaceId = visibleWorkspaceIdByHostId.get(
					port.workspaceId,
				);
				if (!visibleWorkspaceId) return [];
				return [
					{
						...port,
						workspaceId: visibleWorkspaceId,
						killWorkspaceId: port.workspaceId,
						hostUrl: activeHostUrl,
					},
				];
			});
		},
	});

	useEffect(() => {
		if (!activeHostUrl) return;
		const bus = getEventBus(activeHostUrl, () =>
			getHostServiceWsToken(activeHostUrl),
		);
		const remove = bus.on("port:changed", "*", () => {
			void queryClient.invalidateQueries({ queryKey: hostQueryKey });
		});
		const release = bus.retain();
		return () => {
			remove();
			release();
		};
	}, [activeHostUrl, hostQueryKey, queryClient]);

	const workspaceNames = useMemo(() => {
		return allWorkspaces.reduce(
			(acc, ws) => {
				acc[ws.id] = ws.name;
				return acc;
			},
			{} as Record<string, string>,
		);
	}, [allWorkspaces]);

	const workspacePortGroups = useMemo(() => {
		const groupMap = new Map<string, WorkspacePort[]>();

		for (const port of ports) {
			const existing = groupMap.get(port.workspaceId);
			if (existing) {
				existing.push(port);
			} else {
				groupMap.set(port.workspaceId, [port]);
			}
		}

		const groups: WorkspacePortGroup[] = [];
		for (const [workspaceId, wsPorts] of groupMap) {
			groups.push({
				workspaceId,
				workspaceName: workspaceNames[workspaceId] || "Unknown",
				ports: wsPorts.sort((a, b) => a.port - b.port),
			});
		}

		return groups.sort((a, b) =>
			a.workspaceName.localeCompare(b.workspaceName),
		);
	}, [ports, workspaceNames]);

	const totalPortCount = workspacePortGroups.reduce(
		(sum, g) => sum + g.ports.length,
		0,
	);

	return {
		workspacePortGroups,
		totalPortCount,
	};
}
