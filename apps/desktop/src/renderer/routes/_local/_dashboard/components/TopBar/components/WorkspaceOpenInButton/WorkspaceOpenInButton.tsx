import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "../../../../../providers/LocalHostServiceProvider";
import { useWorkspaceCatalog } from "../../../../../providers/WorkspaceCatalogProvider";
import { WorkspaceOpenInMenuButton } from "../WorkspaceOpenInMenuButton";

interface WorkspaceOpenInButtonProps {
	workspaceId: string;
}

export function WorkspaceOpenInButton({
	workspaceId,
}: WorkspaceOpenInButtonProps) {
	const { activeHostUrl } = useLocalHostService();

	const { workspaces } = useWorkspaceCatalog();
	const workspace = workspaces.find((w) => w.id === workspaceId) ?? null;

	const workspaceQuery = useQuery({
		queryKey: ["v2-open-in-workspace", activeHostUrl, workspaceId],
		queryFn: () =>
			getHostServiceClientByUrl(activeHostUrl as string).workspace.get.query({
				id: workspaceId,
			}),
		enabled: !!workspace && !!activeHostUrl,
	});

	if (!workspace || !activeHostUrl) {
		return null;
	}

	if (!workspaceQuery.data?.worktreePath) {
		return null;
	}

	return (
		<WorkspaceOpenInMenuButton
			branch={workspace.branch}
			worktreePath={workspaceQuery.data.worktreePath}
			projectId={workspace.projectId}
		/>
	);
}
