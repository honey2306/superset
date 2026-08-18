import type { SessionStatus } from "@superset/session-protocol";
import { getEventBus } from "@superset/workspace-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { createDesktopAcpSessionClient } from "renderer/lib/acp-session-client";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { useNotificationStore } from "renderer/stores/notifications";
import type { ActivePaneStatus, PaneStatus } from "shared/tabs-types";
import {
	type AcpSessionNotificationState,
	deriveAcpSessionStatus,
	getHighestAcpSessionStatus,
} from "./deriveAcpSessionStatus";

export interface AcpSessionStatusMaps {
	sessionStatuses: Map<string, SessionStatus>;
	notificationStatuses: Map<string, PaneStatus>;
	sessionTitles: Map<string, string | null>;
}

/**
 * Live ACP lifecycle and notification snapshots for every session in a
 * workspace. The same host list powers both tab and workspace indicators.
 */
export function useAcpSessionStatusMapsAtHost(
	hostUrl: string | null,
	hostWorkspaceId: string | null,
): AcpSessionStatusMaps {
	const queryClient = useQueryClient();
	const acpSessionSeenAt = useNotificationStore(
		(state) => state.acpSessionSeenAt,
	);
	const queryKey = useMemo(
		() => ["acp-sessions", hostUrl, hostWorkspaceId] as const,
		[hostUrl, hostWorkspaceId],
	);

	const { data } = useQuery({
		queryKey,
		enabled: Boolean(hostUrl && hostWorkspaceId),
		queryFn: () => {
			if (!hostUrl || !hostWorkspaceId)
				return { items: [], nextCursor: null, enabled: false };
			return createDesktopAcpSessionClient(hostUrl).list({
				workspaceId: hostWorkspaceId,
				limit: 100,
			});
		},
		// Live-pushed via `acp-session:changed` below; a bounded staleTime
		// heals reconnect gaps.
		staleTime: 60_000,
	});

	useEffect(() => {
		if (!hostUrl || !hostWorkspaceId) return;
		const bus = getEventBus(hostUrl, () => getHostServiceWsToken(hostUrl));
		const invalidate = () => {
			void queryClient.invalidateQueries({ queryKey });
		};
		const off = bus.on("acp-session:changed", hostWorkspaceId, invalidate);
		const release = bus.retain();
		return () => {
			off();
			release();
		};
	}, [hostUrl, hostWorkspaceId, queryClient, queryKey]);

	return useMemo(() => {
		const sessionStatuses = new Map<string, SessionStatus>();
		const notificationStatuses = new Map<string, PaneStatus>();
		const sessionTitles = new Map<string, string | null>();
		for (const item of data?.items ?? []) {
			const notificationState: AcpSessionNotificationState = {
				status: item.status,
				lastStopReason: item.lastStopReason,
				lastCompletedAt: item.lastCompletedAt,
				pendingPermissions: item.pendingPermissions,
			};
			sessionStatuses.set(item.sessionId, item.status);
			sessionTitles.set(item.sessionId, item.title);
			notificationStatuses.set(
				item.sessionId,
				deriveAcpSessionStatus(
					notificationState,
					acpSessionSeenAt[item.sessionId],
				),
			);
		}
		return { sessionStatuses, notificationStatuses, sessionTitles };
	}, [acpSessionSeenAt, data]);
}

/** Raw host lifecycle map used to keep ACP pane metadata synchronized. */
export function useAcpSessionStatusesAtHost(
	hostUrl: string | null,
	hostWorkspaceId: string | null,
): Map<string, SessionStatus> {
	return useAcpSessionStatusMapsAtHost(hostUrl, hostWorkspaceId)
		.sessionStatuses;
}

/** Highest-priority user-facing status across all ACP sessions. */
export function useHighestAcpSessionStatusAtHost(
	hostUrl: string | null,
	hostWorkspaceId: string | null,
	openSessionIds?: ReadonlySet<string>,
): ActivePaneStatus | null {
	const { notificationStatuses } = useAcpSessionStatusMapsAtHost(
		hostUrl,
		hostWorkspaceId,
	);
	return useMemo(
		() => getHighestAcpSessionStatus(notificationStatuses, openSessionIds),
		[notificationStatuses, openSessionIds],
	);
}
