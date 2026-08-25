import type { ProjectProjection } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import { isTemporaryProject } from "renderer/utils/isTemporaryProject";

export function isSidebarProjectVisible(
	project: Pick<ProjectProjection, "kind" | "repoPath">,
): boolean {
	return project.kind === "temporary" || !isTemporaryProject(project);
}
