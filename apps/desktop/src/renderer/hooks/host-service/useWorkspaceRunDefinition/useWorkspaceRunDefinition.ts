import { useQuery } from "@tanstack/react-query";
import { hostWorkspaceRunDefinitionQueryKey } from "renderer/hooks/host-service/useHostProjectConfig";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useCatalogWorkspace } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";

export function useWorkspaceRunDefinition(workspaceId: string) {
	const { activeHostUrl } = useLocalHostService();
	const { workspace } = useCatalogWorkspace(workspaceId);
	const projectId = workspace?.projectId ?? "";

	return useQuery({
		queryKey: hostWorkspaceRunDefinitionQueryKey(activeHostUrl, projectId),
		enabled: Boolean(activeHostUrl && projectId),
		queryFn: () => {
			if (!activeHostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).config.getWorkspaceRunDefinition.query({ projectId });
		},
	});
}
