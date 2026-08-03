import { useCallback } from "react";
import { useWorkspaceCreate } from "renderer/stores/workspace-launch/useWorkspaceCreateActions";

export function useOpenTrackedWorktree() {
	const createWorkspace = useWorkspaceCreate();
	const mutateAsync = useCallback(
		({
			projectId,
			worktreePath,
		}: {
			projectId: string;
			worktreePath: string;
		}) =>
			createWorkspace.mutateAsyncWithPendingSetup(
				{
					id: crypto.randomUUID(),
					projectId,
					worktreePath,
				},
				{ resolveInitialCommands: () => [] },
			),
		[createWorkspace],
	);

	return { isPending: createWorkspace.isPending, mutateAsync };
}
