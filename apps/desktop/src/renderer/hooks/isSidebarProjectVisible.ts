import type { ProjectProjection } from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider";
import { isTemporaryProject } from "renderer/utils/isTemporaryProject";

export function isSidebarProjectVisible(
	project: Pick<ProjectProjection, "kind" | "repoPath">,
): boolean {
	return !isTemporaryProject(project);
}
