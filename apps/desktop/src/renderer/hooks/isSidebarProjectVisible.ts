import type { ProjectProjection } from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider";

export function isSidebarProjectVisible(
	project: Pick<ProjectProjection, "kind">,
): boolean {
	return project.kind !== "temporary";
}
