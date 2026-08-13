import { useSyncExternalStore } from "react";
import {
	getPanesStore,
	requirePanesStore,
	subscribePanesRepository,
} from "renderer/lib/panes";

/**
 * Presentation attachment only. Stores are created, hydrated, and persisted by
 * LocalProductStateProvider so route unmounts cannot destroy workspace state.
 */
export function usePanesWorkspacePaneLayout(workspaceId: string) {
	useSyncExternalStore(
		subscribePanesRepository,
		() => getPanesStore(workspaceId),
		() => null,
	);
	return { store: requirePanesStore(workspaceId), isLayoutReady: true };
}
