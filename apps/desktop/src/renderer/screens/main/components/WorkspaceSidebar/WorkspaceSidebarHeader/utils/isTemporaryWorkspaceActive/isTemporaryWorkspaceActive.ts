import { isTemporaryProject } from "renderer/utils/isTemporaryProject";

type WorkspaceProjectMembership = {
	id: string;
	projectId: string;
};

type Project = Parameters<typeof isTemporaryProject>[0];

export function isTemporaryWorkspaceActive(
	workspaceId: string | undefined,
	workspaces: WorkspaceProjectMembership[],
	projects: Project[],
): boolean {
	if (!workspaceId) return false;
	const workspace = workspaces.find(
		(candidate) => candidate.id === workspaceId,
	);
	if (!workspace) return false;
	return projects.some(
		(project) =>
			project.id === workspace.projectId && isTemporaryProject(project),
	);
}
