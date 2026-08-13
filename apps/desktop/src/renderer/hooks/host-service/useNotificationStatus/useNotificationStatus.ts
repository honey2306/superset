import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	getNotificationSourceKey,
	getNotificationSourcesForPane,
	type NotificationPaneLike,
	type NotificationSourceInput,
	useNotificationStore,
} from "renderer/stores/notifications";
import {
	type ActivePaneStatus,
	getHighestPriorityStatus,
} from "shared/tabs-types";
import {
	type TerminalAgentBinding,
	useTerminalAgentBindings,
	useTerminalAgentBindingsAtHost,
} from "../useTerminalAgentBindings";
import {
	deriveTerminalAgentStatus,
	markTerminalAgentBindingsSeen,
	settleClearedTerminalAgentBindings,
	useTerminalAgentStatuses,
} from "../useTerminalAgentStatuses";

const TERMINAL_PREFIX = "terminal:";

function terminalIdsFromSources(
	sources: Iterable<NotificationSourceInput>,
): string[] {
	const ids: string[] = [];
	for (const key of new Set([...sources].map(getNotificationSourceKey))) {
		if (key.startsWith(TERMINAL_PREFIX)) {
			ids.push(key.slice(TERMINAL_PREFIX.length));
		}
	}
	return ids;
}

/**
 * Highest-priority status across a set of notification sources. Terminal
 * statuses are derived from host agent bindings (the single source of
 * truth); chat sources have no status yet and contribute nothing.
 */
export function useSourcesNotificationStatus(
	workspaceId: string,
	sources: Iterable<NotificationSourceInput>,
): ActivePaneStatus | null {
	const statuses = useTerminalAgentStatuses(workspaceId);
	return getHighestPriorityStatus(
		terminalIdsFromSources(sources).map((terminalId) =>
			statuses.get(terminalId),
		),
	);
}

export function usePaneNotificationStatus(
	workspaceId: string,
	pane: NotificationPaneLike | null | undefined,
): ActivePaneStatus | null {
	return useSourcesNotificationStatus(
		workspaceId,
		getNotificationSourcesForPane(pane),
	);
}

export function useWorkspaceNotificationStatus(
	workspaceId: string,
): ActivePaneStatus | null {
	const statuses = useTerminalAgentStatuses(workspaceId);
	const manualUnread = useNotificationStore((state) =>
		Boolean(state.manualUnread[workspaceId]),
	);
	return getHighestPriorityStatus([
		manualUnread ? "review" : undefined,
		...statuses.values(),
	]);
}

export function useWorkspaceIsUnread(workspaceId: string): boolean {
	const statuses = useTerminalAgentStatuses(workspaceId);
	const manualUnread = useNotificationStore((state) =>
		Boolean(state.manualUnread[workspaceId]),
	);
	if (manualUnread) return true;
	for (const status of statuses.values()) {
		if (status === "review" || status === "failed") return true;
	}
	return false;
}

/**
 * Returns a callback that marks every terminal with a live agent binding in
 * the workspace as seen, clearing derived `review` statuses. Used by the
 * sidebar "mark read" / "clear status" actions.
 */
export function useMarkWorkspaceTerminalsSeen(workspaceId: string): () => void {
	const bindings = useTerminalAgentBindings(workspaceId);
	const markTerminalSeen = useNotificationStore(
		(state) => state.markTerminalSeen,
	);
	return useCallback(() => {
		markTerminalAgentBindingsSeen(bindings, markTerminalSeen);
	}, [bindings, markTerminalSeen]);
}

export function useMarkWorkspaceTerminalsSeenAtHost(
	hostUrl: string | null,
	hostWorkspaceId: string | null,
): () => void {
	const bindings = useTerminalAgentBindingsAtHost(hostUrl, hostWorkspaceId);
	const markTerminalSeen = useNotificationStore(
		(state) => state.markTerminalSeen,
	);
	return useCallback(() => {
		markTerminalAgentBindingsSeen(bindings, markTerminalSeen);
	}, [bindings, markTerminalSeen]);
}

export function useClearWorkspaceTerminalStatusesAtHost(
	hostUrl: string | null,
	hostWorkspaceId: string | null,
): () => Promise<void> {
	const bindings = useTerminalAgentBindingsAtHost(hostUrl, hostWorkspaceId);
	const markTerminalSeen = useNotificationStore(
		(state) => state.markTerminalSeen,
	);
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() =>
			[
				"terminal-agent-bindings",
				hostUrl,
				hostWorkspaceId,
				"explicit-host",
			] as const,
		[hostUrl, hostWorkspaceId],
	);
	return useCallback(async () => {
		if (!hostUrl || !hostWorkspaceId) return;
		await getHostServiceClientByUrl(
			hostUrl,
		).terminalAgents.clearWorkspaceStatuses.mutate({
			workspaceId: hostWorkspaceId,
		});
		await settleClearedTerminalAgentBindings({
			bindings,
			markTerminalSeen,
			refresh: () => queryClient.refetchQueries({ queryKey, exact: true }),
			readRefreshedBindings: () =>
				new Map(
					(
						queryClient.getQueryData<TerminalAgentBinding[]>(queryKey) ?? []
					).map((binding) => [binding.terminalId, binding]),
				),
		});
	}, [
		bindings,
		hostUrl,
		hostWorkspaceId,
		markTerminalSeen,
		queryClient,
		queryKey,
	]);
}

/**
 * Number of distinct workspaces needing attention (any derived terminal
 * status other than `working`, or a manual unread mark). Drives the OS dock
 * badge. Aggregates over the bindings queries already mounted by sidebar
 * rows via the react-query cache; workspaces with no observed bindings
 * query contribute only their manual unread mark.
 */
export function useAttentionWorkspaceCount(): number {
	const queryClient = useQueryClient();
	const manualUnread = useNotificationStore((state) => state.manualUnread);
	const terminalSeenAt = useNotificationStore((state) => state.terminalSeenAt);
	const [cacheVersion, setCacheVersion] = useState(0);

	useEffect(() => {
		let disposed = false;
		const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
			if (event.query.queryKey[0] === "terminal-agent-bindings") {
				// React Query can publish an observer-added event while a terminal
				// pane is rendering its useQuery call. Defer the badge refresh so
				// this subscriber never updates DockBadgeController during another
				// component's render.
				queueMicrotask(() => {
					if (!disposed) {
						setCacheVersion((version) => version + 1);
					}
				});
			}
		});
		return () => {
			disposed = true;
			unsubscribe();
		};
	}, [queryClient]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: cacheVersion re-reads the query cache
	return useMemo(() => {
		const workspaceIds = new Set(Object.keys(manualUnread));
		const entries = queryClient.getQueriesData<TerminalAgentBinding[]>({
			queryKey: ["terminal-agent-bindings"],
		});
		for (const [, bindings] of entries) {
			for (const binding of bindings ?? []) {
				const status = deriveTerminalAgentStatus({
					lastEventType: binding.lastEventType,
					lastEventAt: binding.lastEventAt,
					lastSeenAt: terminalSeenAt[binding.terminalId],
				});
				if (
					status === "permission" ||
					status === "review" ||
					status === "failed"
				) {
					workspaceIds.add(binding.workspaceId);
				}
			}
		}
		return workspaceIds.size;
	}, [cacheVersion, manualUnread, terminalSeenAt, queryClient]);
}
