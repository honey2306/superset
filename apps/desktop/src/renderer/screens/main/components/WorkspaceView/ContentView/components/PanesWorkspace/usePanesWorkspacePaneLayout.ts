import { useSyncExternalStore } from "react";
import { getPanesStore, subscribePanesRepository } from "renderer/lib/panes";

/**
 * Presentation attachment only. Stores are created, hydrated, and persisted by
 * LocalProductStateProvider so route unmounts cannot destroy workspace state.
 */
export function usePanesWorkspacePaneLayout(workspaceId: string) {
	const store = useSyncExternalStore(
		subscribePanesRepository,
		() => getPanesStore(workspaceId),
		() => null,
	);
	return { store, isLayoutReady: store !== null };
}
