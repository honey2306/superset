import { Workspace } from "@superset/panes";
import { useEffect } from "react";
import { useAcpSessionStatusesAtHost } from "renderer/hooks/host-service/useAcpSessionStatuses";
import { useTerminalAgentStatusesAtHost } from "renderer/hooks/host-service/useTerminalAgentStatuses";
import { useCatalogWorkspace } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { useHostServiceTerminal } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useHostServiceTerminal";
import {
	getPanesTabStatus,
	syncPanesAcpStatuses,
	syncPanesTerminalStatuses,
} from "./createPanesTerminalPaneBridge";
import { PanesPresetBar } from "./PanesPresetBar";
import { registerPanesStore, unregisterPanesStore } from "./panesStoreRegistry";
import { useAcpSessionOpenRequests } from "./useAcpSessionOpenRequests";
import { usePanesDeepLinkConsumer } from "./usePanesDeepLinkConsumer";
import { usePanesHotkeys } from "./usePanesHotkeys";
import { usePanesWorkspace } from "./usePanesWorkspace";

/**
 * Renders a v1 workspace view's tabs through the v2-grade `@superset/panes`
 * engine instead of the v1 mosaic + global tabs store.
 *
 * Mounted by `ContentView` as the workspace pane engine. When the
 * flag is on, this component fully owns the active workspace view — the v1
 * global tabs store is not consulted for this view. The store is persisted by
 * `usePanesWorkspacePaneLayout` (M1) and the registry wires the terminal
 * pane's lifecycle/context menu (M2). The default split/close/equalize/move
 * actions are wired through the v1 terminal launcher and injected via the
 * `<Workspace>` `paneActions` / `contextMenuActions` props.
 *
 * The preset bar restores the one-click agent preset launch that M1's
 * wholesale ContentView replacement dropped: presets open into the panes
 * store via `usePanesPresetOpeners`. Hotkeys (CLOSE_PANE with the
 * `onBeforeClose` guard, SPLIT_*, EQUALIZE, NEW_GROUP, PREV/NEXT_TAB) are
 * registered by `usePanesHotkeys`.
 */
export function PanesWorkspace({ workspaceId }: { workspaceId: string }) {
	const { workspace } = useCatalogWorkspace(workspaceId);
	const { hostUrl, hostWorkspaceId } = useHostServiceTerminal({
		workspaceId,
		worktreePath: workspace?.worktreePath,
	});
	const {
		store,
		registry,
		launcher,
		paneActions,
		contextMenuActions,
		openers,
	} = usePanesWorkspace(workspaceId, { hostUrl, hostWorkspaceId });
	const terminalStatuses = useTerminalAgentStatusesAtHost(
		hostUrl,
		hostWorkspaceId,
	);
	const acpStatuses = useAcpSessionStatusesAtHost(hostUrl, hostWorkspaceId);
	useAcpSessionOpenRequests({ store, hostUrl, hostWorkspaceId });

	useEffect(() => {
		syncPanesTerminalStatuses(store, terminalStatuses);
	}, [store, terminalStatuses]);

	useEffect(() => {
		syncPanesAcpStatuses(store, acpStatuses);
	}, [store, acpStatuses]);

	usePanesHotkeys({
		store,
		registry,
		launcher,
		addTerminalTab: openers.addTerminalTab,
	});

	// Consume deep-link search params (terminalId / openUrl / …) into the
	// panes store. No-op for params that are absent.
	usePanesDeepLinkConsumer({ store, hostUrl, hostWorkspaceId });

	// Register the active workspace navigation service used directly by route,
	// command-palette, sidebar, ACP, and rename-reconciliation callers.
	useEffect(() => {
		registerPanesStore(workspaceId, store);
		return () => unregisterPanesStore(workspaceId, store);
	}, [workspaceId, store]);

	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
			<Workspace
				className="flex-1"
				store={store}
				registry={registry}
				paneActions={paneActions}
				contextMenuActions={contextMenuActions}
				onAddTab={openers.addTerminalTab}
				renderTabAccessory={(tab) => {
					const status = getPanesTabStatus(tab);
					return status ? <StatusIndicator status={status} /> : null;
				}}
				renderBelowTabBar={() => (
					<PanesPresetBar
						openers={openers}
						store={store}
						workspaceId={workspaceId}
					/>
				)}
			/>
		</div>
	);
}
