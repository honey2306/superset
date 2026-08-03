import { useCallback, useEffect, useRef } from "react";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export function useBranchSyncInvalidation({
	gitBranch,
	workspaceBranch,
	workspaceId,
}: {
	gitBranch: string | undefined;
	workspaceBranch: string | undefined;
	workspaceId: string;
}) {
	const hostTarget = useWorkspaceHostTarget(workspaceId);
	const hostUrl = hostTarget.status === "ready" ? hostTarget.url : null;
	const syncingRef = useRef<string | null>(null);

	const doSync = useCallback(
		async (branch: string) => {
			if (!hostUrl) {
				syncingRef.current = null;
				return;
			}
			try {
				await getHostServiceClientByUrl(hostUrl).workspace.update.mutate({
					id: workspaceId,
					branch,
				});
			} catch (error) {
				console.warn("Failed to sync workspace branch with host", {
					workspaceId,
					branch,
					error,
				});
			} finally {
				syncingRef.current = null;
			}
		},
		[hostUrl, workspaceId],
	);

	useEffect(() => {
		if (!gitBranch || gitBranch === "HEAD" || !workspaceBranch) return;
		if (gitBranch === workspaceBranch) {
			syncingRef.current = null;
			return;
		}
		if (syncingRef.current === gitBranch) return;
		syncingRef.current = gitBranch;

		doSync(gitBranch);
	}, [gitBranch, workspaceBranch, doSync]);
}
