import { Workspace } from "@superset/panes";
import { useEffect } from "react";
import { useAcpSessionStatusesAtHost } from "renderer/hooks/host-service/useAcpSessionStatuses";
import { useTerminalAgentStatusesAtHost } from "renderer/hooks/host-service/useTerminalAgentStatuses";
import { useCatalogWorkspace } from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider/selectors";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { useHostServiceTerminal } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useHostServiceTerminal";
import {
	getV1PanesTabStatus,
	syncV1PanesAcpStatuses,
	syncV1PanesTerminalStatuses,
} from "./createV1PanesTerminalPaneBridge";
import { useAcpSessionOpenRequests } from "./useAcpSessionOpenRequests";
import { useV1PanesDeepLinkConsumer } from "./useV1PanesDeepLinkConsumer";
import { useV1PanesHotkeys } from "./useV1PanesHotkeys";
import { useV1PanesWorkspace } from "./useV1PanesWorkspace";
import { V1PanesPresetBar } from "./V1PanesPresetBar";
import {
	registerV1PanesStore,
	unregisterV1PanesStore,
} from "./v1PanesStoreRegistry";

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
	const { workspace } = useCatalogWorkspace(workspaceId);
	const { hostUrl, hostWorkspaceId } = useHostServiceTerminal({
		workspaceId,
		worktreePath: workspace?.worktreePath,
		forceEnabled: true,
	});
	const {
		store,
		registry,
		launcher,
		paneActions,
		contextMenuActions,
		openers,
	} = useV1PanesWorkspace(workspaceId, { hostUrl, hostWorkspaceId });
	const terminalStatuses = useTerminalAgentStatusesAtHost(
		hostUrl,
		hostWorkspaceId,
	);
	const acpStatuses = useAcpSessionStatusesAtHost(hostUrl, hostWorkspaceId);
	useAcpSessionOpenRequests({ store, hostUrl, hostWorkspaceId });

	useEffect(() => {
		syncV1PanesTerminalStatuses(store, terminalStatuses);
	}, [store, terminalStatuses]);

	useEffect(() => {
		syncV1PanesAcpStatuses(store, acpStatuses);
	}, [store, acpStatuses]);

	useV1PanesHotkeys({
		store,
		registry,
		launcher,
		addTerminalTab: openers.addTerminalTab,
	});

	// Consume deep-link search params (terminalId / openUrl / …) into the
	// panes store. No-op for params that are absent.
	useV1PanesDeepLinkConsumer({ store, hostUrl, hostWorkspaceId });

	// Register the per-workspace panes store so v1 global tabs store opener
	// actions (e.g. `openCommentPane` from `ReviewPanel`) can route into the
	// panes store when this view owns the workspace. Unmount-cleaned so a
	// stale entry cannot outlive the React tree that owned the store.
	useEffect(() => {
		registerV1PanesStore(workspaceId, store);
		return () => unregisterV1PanesStore(workspaceId, store);
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
					const status = getV1PanesTabStatus(tab);
					return status ? <StatusIndicator status={status} /> : null;
				}}
				renderBelowTabBar={() => (
					<V1PanesPresetBar
						openers={openers}
						store={store}
						workspaceId={workspaceId}
					/>
				)}
			/>
		</div>
	);
}
