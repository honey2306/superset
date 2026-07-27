import { Workspace } from "@superset/panes";
import { useV1PanesHotkeys } from "./useV1PanesHotkeys";
import { useV1PanesWorkspace } from "./useV1PanesWorkspace";
import { V1PanesPresetBar } from "./V1PanesPresetBar";

/**
 * Renders a v1 workspace view's tabs through the v2-grade `@superset/panes`
 * engine instead of the v1 mosaic + global tabs store.
 *
 * Mounted by `ContentView` behind the `V2_PANES_IN_V1` feature flag. When the
 * flag is on, this component fully owns the active workspace view — the v1
 * global tabs store is not consulted for this view. The store is persisted by
 * `useV1PanesWorkspacePaneLayout` (M1) and the registry wires the terminal
 * pane's lifecycle/context menu (M2). The default split/close/equalize/move
 * actions are wired through the v1 terminal launcher and injected via the
 * `<Workspace>` `paneActions` / `contextMenuActions` props.
 *
 * The preset bar restores the one-click agent preset launch that M1's
 * wholesale ContentView replacement dropped: presets open into the panes
 * store via `useV1PanesPresetOpeners`. Hotkeys (CLOSE_PANE with the
 * `onBeforeClose` guard, SPLIT_*, EQUALIZE, NEW_GROUP, PREV/NEXT_TAB) are
 * registered by `useV1PanesHotkeys`.
 */
export function V1PanesWorkspace({ workspaceId }: { workspaceId: string }) {
	const {
		store,
		registry,
		launcher,
		paneActions,
		contextMenuActions,
		openers,
	} = useV1PanesWorkspace(workspaceId);

	useV1PanesHotkeys({
		store,
		registry,
		launcher,
		addTerminalTab: openers.addTerminalTab,
	});

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
			<V1PanesPresetBar workspaceId={workspaceId} openers={openers} />
			<Workspace
				store={store}
				registry={registry}
				paneActions={paneActions}
				contextMenuActions={contextMenuActions}
			/>
		</div>
	);
}
