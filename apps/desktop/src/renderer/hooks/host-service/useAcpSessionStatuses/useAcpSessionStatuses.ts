import type { SessionStatus } from "@superset/session-protocol";
import { getEventBus } from "@superset/workspace-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { createDesktopAcpSessionClient } from "renderer/lib/acp-session-client";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { acpSessionStatusToPaneStatus } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/PanesWorkspace/createPanesTerminalPaneBridge";
import {
	type ActivePaneStatus,
	getHighestPriorityStatus,
	type PaneStatus,
} from "shared/tabs-types";

/**
 * Live map of `sessionId → SessionStatus` for every ACP session in a workspace,
 * read from the host and invalidated on `acp-session:changed` events on the
 * host event bus. Backs both the workspace sidebar (aggregate red dot) and the
 * v2-panes-in-v1 tab strip (per-tab accessory), so the two surfaces cannot
 * drift by living off independent subscriptions.
 */
export function useAcpSessionStatusesAtHost(
	hostUrl: string | null,
	hostWorkspaceId: string | null,
): Map<string, SessionStatus> {
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() => ["acp-sessions", hostUrl, hostWorkspaceId] as const,
		[hostUrl, hostWorkspaceId],
	);

	const { data } = useQuery({
		queryKey,
		enabled: Boolean(hostUrl && hostWorkspaceId),
		queryFn: () => {
			if (!hostUrl || !hostWorkspaceId)
				return { items: [], nextCursor: null } as {
					items: { sessionId: string; status: SessionStatus }[];
					nextCursor: string | null;
				};
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
		const map = new Map<string, SessionStatus>();
		for (const item of data?.items ?? []) {
			map.set(item.sessionId, item.status);
		}
		return map;
	}, [data]);
}

/** Highest-priority pane status across all ACP sessions in the workspace. */
export function useHighestAcpSessionStatusAtHost(
	hostUrl: string | null,
	hostWorkspaceId: string | null,
): ActivePaneStatus | null {
	const statuses = useAcpSessionStatusesAtHost(hostUrl, hostWorkspaceId);
	return useMemo(() => {
		const paneStatuses: PaneStatus[] = [];
		for (const status of statuses.values()) {
			paneStatuses.push(acpSessionStatusToPaneStatus(status));
		}
		return getHighestPriorityStatus(paneStatuses);
	}, [statuses]);
}
