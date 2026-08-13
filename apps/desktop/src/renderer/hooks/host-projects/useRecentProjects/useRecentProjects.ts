import { useMemo } from "react";
import type { ProjectOption } from "renderer/routes/_local/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";

export function useRecentProjects(): ProjectOption[] {
	// Projects come from the local Workspace Catalog.
	const { projects: hostProjects } = useWorkspaceCatalog();

	return useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.id,
				name: project.name,
				githubOwner: project.repoOwner,
				githubRepoName: project.repoName,
				iconUrl: project.repoOwner
					? `https://github.com/${project.repoOwner}.png?size=64`
					: null,
				needsSetup: null,
			})),
		[hostProjects],
	);
}
