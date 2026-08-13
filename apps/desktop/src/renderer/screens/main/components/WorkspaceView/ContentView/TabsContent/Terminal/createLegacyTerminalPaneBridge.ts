import { useTabsStore } from "renderer/stores/tabs/store";
import type { HostServiceTerminalPaneBridge } from "./host-service-terminal-pane-bridge";

export function createLegacyTerminalPaneBridge({
	paneId,
	workspaceId,
	isFocused,
}: {
	paneId: string;
	workspaceId: string;
	isFocused: boolean;
}): HostServiceTerminalPaneBridge {
	return {
		isFocused,
		getSnapshot: () => useTabsStore.getState().panes[paneId] ?? null,
		isDestroyed: () => useTabsStore.getState().panes[paneId] === undefined,
		setTitle: (title) => useTabsStore.getState().setPaneName(paneId, title),
		setStatus: (status) =>
			useTabsStore.getState().setPaneStatus(paneId, status),
		setCwd: (cwd, confirmed) =>
			useTabsStore.getState().updatePaneCwd(paneId, cwd, confirmed),
		setWorkspaceRunState: (state) => {
			const store = useTabsStore.getState();
			const current = store.panes[paneId]?.workspaceRun;
			if (current) store.setPaneWorkspaceRun(paneId, { ...current, state });
		},
		setLifecycleScript: (script) =>
			useTabsStore.getState().setPaneLifecycleScript(paneId, script),
		clearInitialData: () =>
			useTabsStore.getState().clearPaneInitialData(paneId),
		openFileViewer: (options) =>
			useTabsStore.getState().addFileViewerPane(workspaceId, options),
		close: () => useTabsStore.getState().removePane(paneId),
	};
}
