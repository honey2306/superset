import type { WorkspaceState } from "@superset/panes";
import { useSyncExternalStore } from "react";
import { getPanesStore, subscribePanesRepository } from "./repository";
import type { PanesPaneData } from "./types";

const EMPTY_STATE: WorkspaceState<PanesPaneData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

export function usePanesWorkspaceState(
	workspaceId?: string | null,
): WorkspaceState<PanesPaneData> {
	return useSyncExternalStore(
		(onStoreChange) => {
			let unsubscribeStore = workspaceId
				? getPanesStore(workspaceId)?.subscribe(onStoreChange)
				: undefined;
			const unsubscribeRepository = subscribePanesRepository(() => {
				unsubscribeStore?.();
				unsubscribeStore = workspaceId
					? getPanesStore(workspaceId)?.subscribe(onStoreChange)
					: undefined;
				onStoreChange();
			});
			return () => {
				unsubscribeStore?.();
				unsubscribeRepository();
			};
		},
		() =>
			(workspaceId ? getPanesStore(workspaceId)?.getState() : null) ??
			EMPTY_STATE,
		() => EMPTY_STATE,
	);
}
