import { FEATURE_FLAGS } from "@superset/shared/constants";
import { getEventBus } from "@superset/workspace-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { EnrichedPort } from "shared/types";

const PORTS_FALLBACK_REFETCH_INTERVAL_MS = 10_000;

export interface WorkspacePortGroup {
	workspaceId: string;
	workspaceName: string;
	ports: V1WorkspacePort[];
}

export interface V1WorkspacePort extends EnrichedPort {
	hostUrl: string | null;
	killWorkspaceId?: string;
}

function normalizePath(path: string): string {
	return path.replace(/[\\/]+$/, "");
}

export function usePortsData() {
	const { data: workspaceGroups } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const allWorkspaces = useMemo(
		() =>
			workspaceGroups?.flatMap((group) => [
				...group.workspaces,
				...group.sections.flatMap((section) => section.workspaces),
			]),
		[workspaceGroups],
	);
	const hostEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.V1_HOST_SERVICE_TERMINAL) ?? false;
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();

	const utils = electronTrpc.useUtils();

	const { data: localPorts } = electronTrpc.ports.getAll.useQuery(undefined, {
		// Keep a low-frequency safety net in case subscription events are missed.
		refetchInterval: PORTS_FALLBACK_REFETCH_INTERVAL_MS,
	});

	electronTrpc.ports.subscribe.useSubscription(undefined, {
		onData: () => {
			utils.ports.getAll.invalidate();
		},
	});

	const hostQueryKey = useMemo(
		() =>
			[
				"v1-host-service-ports",
				activeHostUrl,
				allWorkspaces?.map((workspace) => workspace.id),
			] as const,
		[activeHostUrl, allWorkspaces],
	);
	const { data: hostPorts = [] } = useQuery({
		queryKey: hostQueryKey,
		enabled: hostEnabled && Boolean(activeHostUrl && allWorkspaces?.length),
		refetchInterval: PORTS_FALLBACK_REFETCH_INTERVAL_MS,
		queryFn: async (): Promise<V1WorkspacePort[]> => {
			if (!activeHostUrl || !allWorkspaces) return [];
			const client = getHostServiceClientByUrl(activeHostUrl);
			const hostWorkspaces = await client.workspace.list.query();
			const v1ByPath = new Map(
				allWorkspaces
					.filter((workspace) => workspace.worktreePath)
					.map((workspace) => [
						normalizePath(workspace.worktreePath),
						workspace.id,
					]),
			);
			const hostToV1 = new Map(
				hostWorkspaces.flatMap((workspace) => {
					const v1Id = v1ByPath.get(normalizePath(workspace.worktreePath));
					return v1Id ? [[workspace.id, v1Id] as const] : [];
				}),
			);
			const workspaceIds = [...hostToV1.keys()];
			if (workspaceIds.length === 0) return [];
			const ports = await client.ports.getAll.query({ workspaceIds });
			return ports.flatMap((port) => {
				const v1WorkspaceId = hostToV1.get(port.workspaceId);
				if (!v1WorkspaceId) return [];
				return [
					{
						...port,
						workspaceId: v1WorkspaceId,
						killWorkspaceId: port.workspaceId,
						hostUrl: activeHostUrl,
					},
				];
			});
		},
	});

	useEffect(() => {
		if (!hostEnabled || !activeHostUrl) return;
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
	}, [activeHostUrl, hostEnabled, hostQueryKey, queryClient]);

	const ports = useMemo<V1WorkspacePort[]>(
		() => (hostEnabled ? hostPorts : (localPorts ?? [])),
		[hostEnabled, hostPorts, localPorts],
	);

	const workspaceNames = useMemo(() => {
		if (!allWorkspaces) return {};
		return allWorkspaces.reduce(
			(acc, ws) => {
				acc[ws.id] = ws.name;
				return acc;
			},
			{} as Record<string, string>,
		);
	}, [allWorkspaces]);

	const workspacePortGroups = useMemo(() => {
		const groupMap = new Map<string, V1WorkspacePort[]>();

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
