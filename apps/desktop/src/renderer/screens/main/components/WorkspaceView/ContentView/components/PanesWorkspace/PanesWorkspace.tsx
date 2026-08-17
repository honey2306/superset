import { WorkspaceLoadingState } from "renderer/routes/_local/_dashboard/workspace/components/WorkspaceLoadingState";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { HydratedPanesWorkspace } from "./components/HydratedPanesWorkspace";
import { usePanesWorkspacePaneLayout } from "./usePanesWorkspacePaneLayout";

/**
 * Waits for local pane state before mounting the hook-heavy panes workspace.
 * Newly provisioned workspaces can become routable one render before their
 * local-state row reaches the process-lifetime panes repository.
 */
export function PanesWorkspace({ workspaceId }: { workspaceId: string }) {
	const { activeHostUrl: hostUrl } = useLocalHostService();
	const hostWorkspaceId = hostUrl ? workspaceId : null;
	const { store, isLayoutReady } = usePanesWorkspacePaneLayout(workspaceId);

	if (!isLayoutReady || !store) {
		return <WorkspaceLoadingState />;
	}

	return (
		<HydratedPanesWorkspace
			workspaceId={workspaceId}
			store={store}
			hostUrl={hostUrl}
			hostWorkspaceId={hostWorkspaceId}
		/>
	);
}
