import { Workspace } from "@superset/panes";
import { useV1PanesWorkspace } from "./useV1PanesWorkspace";

/**
 * PoC: renders a v1 workspace view's tabs through the v2-grade `@superset/panes`
 * engine instead of the v1 mosaic + global tabs store.
 *
 * Mounted by `TabsContent` behind the `V2_PANES_IN_V1` feature flag. When the
 * flag is on, this component fully owns the active workspace view — the v1
 * global tabs store is not consulted for this view. The store is in-memory and
 * seeded with one terminal pane; persistence and richer pane types arrive in
 * later phases.
 */
export function V1PanesWorkspace({ workspaceId }: { workspaceId: string }) {
	const { store, registry, addTerminalPane } = useV1PanesWorkspace(workspaceId);

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
			<Workspace store={store} registry={registry} />
			{/*
			 * PoC-only ad-hoc control so the validator can add a second terminal
			 * pane without implementing the full add-tab menu. Not part of the
			 * eventual product surface.
			 */}
			<button
				type="button"
				onClick={addTerminalPane}
				className="pointer-events-auto absolute bottom-2 right-2 z-10 rounded bg-muted px-2 py-1 text-xs"
			>
				+ terminal (PoC)
			</button>
		</div>
	);
}
