import { retargetPanesFileViewerPaths } from "renderer/lib/panes";
import { useWorkspaceFileEvents } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents";
import { useChangesStore } from "renderer/stores/changes";

interface UseWorkspaceRenameReconciliationOptions {
	workspaceId: string;
	worktreePath?: string;
	enabled?: boolean;
}

export function useWorkspaceRenameReconciliation({
	workspaceId,
	worktreePath,
	enabled = true,
}: UseWorkspaceRenameReconciliationOptions): void {
	const retargetSelectedFile = useChangesStore(
		(store) => store.retargetSelectedFile,
	);

	useWorkspaceFileEvents(
		workspaceId,
		(event) => {
			if (
				event.type !== "rename" ||
				!event.absolutePath ||
				!event.oldAbsolutePath ||
				!worktreePath
			) {
				return;
			}

			retargetPanesFileViewerPaths(
				workspaceId,
				event.oldAbsolutePath,
				event.absolutePath,
				Boolean(event.isDirectory),
			);
			retargetSelectedFile(
				workspaceId,
				event.oldAbsolutePath,
				event.absolutePath,
				worktreePath,
				Boolean(event.isDirectory),
			);
		},
		enabled && Boolean(workspaceId && worktreePath),
	);
}
