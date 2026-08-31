import type { DisposeHostSessionsResult } from "renderer/lib/dispose-host-sessions";

export interface ProjectCloseOrchestrationOptions {
	projectId: string;
	projectWorkspaces: readonly { id: string }[];
	shouldNavigate: boolean;
	removeProjectFromSidebar: (projectId: string) => void;
	closeDialog: () => void;
	navigate: () => void;
	disposeWorkspaceSessions: (
		workspaceId: string,
	) => Promise<DisposeHostSessionsResult>;
	onDisposeResult: (
		result: DisposeHostSessionsResult,
		retry: () => Promise<DisposeHostSessionsResult>,
	) => void;
	onDisposeError: (error: unknown) => void;
}

/**
 * Close a project in the sidebar immediately, then clean up its host sessions
 * without holding the foreground UI on host-service latency.
 */
export function closeProjectImmediately({
	projectId,
	projectWorkspaces,
	shouldNavigate,
	removeProjectFromSidebar,
	closeDialog,
	navigate,
	disposeWorkspaceSessions,
	onDisposeResult,
	onDisposeError,
}: ProjectCloseOrchestrationOptions): void {
	removeProjectFromSidebar(projectId);
	closeDialog();
	if (shouldNavigate) navigate();

	void Promise.all(
		projectWorkspaces.map(async (workspace) => {
			const retry = () => disposeWorkspaceSessions(workspace.id);
			const result = await retry();
			onDisposeResult(result, retry);
		}),
	).catch(onDisposeError);
}
