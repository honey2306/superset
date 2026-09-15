import type { SessionsPage } from "@superset/session-protocol";
import { getEventBus } from "@superset/workspace-client";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import {
	deriveAcpSessionStatus,
	getHighestAcpSessionStatus,
} from "renderer/hooks/host-service/useAcpSessionStatuses/deriveAcpSessionStatus";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings/useTerminalAgentBindings";
import { getHighestTerminalAgentStatus } from "renderer/hooks/host-service/useTerminalAgentStatuses/deriveTerminalAgentStatus";
import { createDesktopAcpSessionClient } from "renderer/lib/acp-session-client";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useNotificationStore } from "renderer/stores/notifications";
import {
	type ActivePaneStatus,
	getHighestPriorityStatus,
} from "shared/tabs-types";

/** 置顶「进行中」组关心的状态：agent 正在跑或需要人介入。
 * `review`（产出待审）不置顶——它属于「已完成待看」，留在原位置用绿点表达。 */
const LIVE_STATUSES = new Set<ActivePaneStatus>([
	"working",
	"permission",
	"askuser",
	"failed",
]);

export interface WorkspaceActivity {
	/** 最高优先级的 agent 状态；null = 空闲 */
	status: ActivePaneStatus | null;
	/** agent 最后一次活动的时间戳；null = 从来没跑过 agent */
	lastActivityAt: number | null;
}

export function isLiveStatus(status: ActivePaneStatus | null): boolean {
	return status !== null && LIVE_STATUSES.has(status);
}

/**
 * 聚合侧栏全部 workspace 的 agent 活动（terminal + ACP）：状态 + 最后活动时间。
 * queryKey 与 WorkspaceListItem 内的逐 workspace hook 完全一致——共享缓存，
 * 不产生重复请求。项目视图用它挑出「进行中」置顶组，时间线视图用它排序。
 */
export function useSidebarWorkspaceActivity(
	workspaces: Array<{ id: string }>,
): Map<string, WorkspaceActivity> {
	const { activeHostUrl: hostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const terminalSeenAt = useNotificationStore((state) => state.terminalSeenAt);
	const acpSessionSeenAt = useNotificationStore(
		(state) => state.acpSessionSeenAt,
	);

	// 序列化 id 列表：作为事件订阅与 memo 的稳定依赖
	const workspaceIdsKey = useMemo(
		() => workspaces.map((workspace) => workspace.id).join(","),
		[workspaces],
	);

	const terminalQueries = useQueries({
		queries: (hostUrl && workspaceIdsKey ? workspaceIdsKey.split(",") : []).map(
			(workspaceId) => ({
				queryKey: [
					"terminal-agent-bindings",
					hostUrl,
					workspaceId,
					"explicit-host",
				] as const,
				queryFn: () => {
					if (!hostUrl) return [] as TerminalAgentBinding[];
					return getHostServiceClientByUrl(
						hostUrl,
					).terminalAgents.listByWorkspace.query({ workspaceId });
				},
				staleTime: 30_000,
			}),
		),
	});

	const acpQueries = useQueries({
		queries: (hostUrl && workspaceIdsKey ? workspaceIdsKey.split(",") : []).map(
			(workspaceId) => ({
				queryKey: ["acp-sessions", hostUrl, workspaceId] as const,
				queryFn: () => {
					if (!hostUrl) return { items: [], nextCursor: null, enabled: false };
					return createDesktopAcpSessionClient(hostUrl).list({
						workspaceId,
						limit: 100,
					});
				},
				staleTime: 60_000,
			}),
		),
	});

	const invalidateWorkspace = useCallback(
		(workspaceId: string) => {
			void queryClient.invalidateQueries({
				queryKey: [
					"terminal-agent-bindings",
					hostUrl,
					workspaceId,
					"explicit-host",
				],
			});
			void queryClient.invalidateQueries({
				queryKey: ["acp-sessions", hostUrl, workspaceId],
			});
		},
		[hostUrl, queryClient],
	);

	// 与逐 workspace hook 相同的三类生命周期事件驱动的失效
	useEffect(() => {
		if (!hostUrl || !workspaceIdsKey) return;
		const bus = getEventBus(hostUrl, () => getHostServiceWsToken(hostUrl));
		const offs = workspaceIdsKey
			.split(",")
			.flatMap((workspaceId) => [
				bus.on("agent:lifecycle", workspaceId, () =>
					invalidateWorkspace(workspaceId),
				),
				bus.on("terminal:lifecycle", workspaceId, () =>
					invalidateWorkspace(workspaceId),
				),
				bus.on("acp-session:changed", workspaceId, () =>
					invalidateWorkspace(workspaceId),
				),
			]);
		const release = bus.retain();
		return () => {
			for (const off of offs) off();
			release();
		};
	}, [hostUrl, workspaceIdsKey, invalidateWorkspace]);

	return useMemo(() => {
		const activity = new Map<string, WorkspaceActivity>();
		if (!hostUrl) return activity;
		const workspaceIds = workspaceIdsKey ? workspaceIdsKey.split(",") : [];
		for (const [index, workspaceId] of workspaceIds.entries()) {
			const terminalData = terminalQueries[index]?.data;
			const acpData = acpQueries[index]?.data;

			const terminalStatus = terminalData
				? getHighestTerminalAgentStatus(
						new Map(terminalData.map((b) => [b.terminalId, b])),
						terminalSeenAt,
					)
				: null;
			const acpStatus = acpData
				? getHighestAcpSessionStatus(
						deriveAcpNotificationStatuses(acpData, acpSessionSeenAt),
					)
				: null;

			activity.set(workspaceId, {
				status: getHighestPriorityStatus([
					terminalStatus ?? undefined,
					acpStatus ?? undefined,
				]),
				lastActivityAt: latestActivityAt(terminalData, acpData),
			});
		}
		return activity;
	}, [
		hostUrl,
		workspaceIdsKey,
		terminalQueries,
		acpQueries,
		terminalSeenAt,
		acpSessionSeenAt,
	]);
}

/** terminal 事件与 ACP 完成时间里最近的那个 */
function latestActivityAt(
	terminalData: TerminalAgentBinding[] | undefined,
	acpData: SessionsPage | undefined,
): number | null {
	let latest: number | null = null;
	for (const binding of terminalData ?? []) {
		if (latest === null || binding.lastEventAt > latest) {
			latest = binding.lastEventAt;
		}
	}
	for (const item of acpData?.items ?? []) {
		const completedAt = item.lastCompletedAt ?? null;
		if (completedAt !== null && (latest === null || completedAt > latest)) {
			latest = completedAt;
		}
	}
	return latest;
}

function deriveAcpNotificationStatuses(
	page: SessionsPage,
	acpSessionSeenAt: Readonly<Record<string, number>>,
): ReadonlyMap<string, ReturnType<typeof deriveAcpSessionStatus>> {
	const notificationStatuses = new Map<
		string,
		ReturnType<typeof deriveAcpSessionStatus>
	>();
	for (const item of page.items) {
		notificationStatuses.set(
			item.sessionId,
			deriveAcpSessionStatus(
				{
					status: item.status,
					lastStopReason: item.lastStopReason,
					lastCompletedAt: item.lastCompletedAt,
					pendingPermissions: item.pendingPermissions,
				},
				acpSessionSeenAt[item.sessionId],
			),
		);
	}
	return notificationStatuses;
}
