import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	useWorkspaceLaunch,
	useWorkspaceProvisioningAdapter,
} from "renderer/stores/workspace-launch";
import { launchesToPaneLayoutInputs } from "renderer/stores/workspace-launch/request";
import { writeWorkspacePaneLayout } from "renderer/stores/workspace-launch/writeWorkspacePaneLayout";

export function useOpenMainRepoWorkspace() {
	const navigate = useNavigate();
	const adapter = useWorkspaceProvisioningAdapter();
	const workspaceLaunch = useWorkspaceLaunch(adapter);
	const collections = useCollections();
	const [isPending, setIsPending] = useState(false);

	const mutateAsync = useCallback(
		async ({ projectId }: { projectId: string }) => {
			if (!adapter) throw new Error("Workspace host is not available");
			setIsPending(true);
			try {
				const operation = await workspaceLaunch.begin({
					adapter,
					request: {
						idempotencyKey: `main-workspace:${projectId}`,
						project: { kind: "existing", projectId },
						source: { kind: "main" },
						initialSessions: [
							{ key: "setup", kind: "setup", requirement: "best-effort" },
						],
					},
				});
				if (!operation.workspaceId) {
					throw new Error(
						operation.failure?.message ?? "Workspace provisioning failed",
					);
				}
				if (operation.state === "failed") {
					throw new Error(
						operation.failure?.message ?? "Workspace setup failed",
					);
				}
				const launchInputs = launchesToPaneLayoutInputs(operation);
				writeWorkspacePaneLayout(
					collections,
					{ id: operation.workspaceId, projectId },
					launchInputs.terminals,
					launchInputs.agents,
				);
				await navigateToWorkspace(operation.workspaceId, navigate);
				return operation;
			} finally {
				setIsPending(false);
			}
		},
		[adapter, collections, navigate, workspaceLaunch],
	);

	return { isPending, mutateAsync, mutateAsyncWithSetup: mutateAsync };
}
