import type { WorkspaceState } from "@superset/panes";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
	getPanesStore,
	type PanesStore,
	subscribePanesRepository,
} from "./repository";
import type { PanesPaneData } from "./types";

export function getOpenAcpSessionIds(
	state: Pick<WorkspaceState<PanesPaneData>, "tabs"> | null,
): string[] {
	return (
		state?.tabs.flatMap((tab) =>
			Object.values(tab.panes).flatMap((pane) =>
				pane.kind === "acp" && pane.data.acp?.sessionId
					? [pane.data.acp.sessionId]
					: [],
			),
		) ?? []
	);
}

function openSessionsSnapshot(workspaceIds: readonly string[]): string {
	return JSON.stringify(
		workspaceIds.map((workspaceId) => [
			workspaceId,
			getOpenAcpSessionIds(getPanesStore(workspaceId)?.getState() ?? null),
		]),
	);
}

export function useOpenAcpSessionIdsByWorkspace(
	workspaceIds: readonly string[],
): ReadonlyMap<string, ReadonlySet<string>> {
	const workspaceIdsKey = JSON.stringify(workspaceIds);
	const stableWorkspaceIds = useMemo<readonly string[]>(
		() => JSON.parse(workspaceIdsKey) as string[],
		[workspaceIdsKey],
	);
	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			let unsubscribeStores: Array<() => void> = [];
			const subscribeStores = () => {
				for (const unsubscribe of unsubscribeStores) unsubscribe();
				unsubscribeStores = stableWorkspaceIds.flatMap((workspaceId) => {
					const store: PanesStore | null = getPanesStore(workspaceId);
					return store ? [store.subscribe(onStoreChange)] : [];
				});
			};
			subscribeStores();
			const unsubscribeRepository = subscribePanesRepository(() => {
				subscribeStores();
				onStoreChange();
			});
			return () => {
				unsubscribeRepository();
				for (const unsubscribe of unsubscribeStores) unsubscribe();
			};
		},
		[stableWorkspaceIds],
	);
	const getSnapshot = useCallback(
		() => openSessionsSnapshot(stableWorkspaceIds),
		[stableWorkspaceIds],
	);
	const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "[]");

	return useMemo(
		() =>
			new Map(
				(JSON.parse(snapshot) as Array<[string, string[]]>).map(
					([workspaceId, sessionIds]) => [workspaceId, new Set(sessionIds)],
				),
			),
		[snapshot],
	);
}
