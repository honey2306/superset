type WorkspaceProjectMembership = {
	id: string;
	projectId: string;
};

type ProjectKind = {
	id: string;
	kind: "repository" | "temporary";
};

export function isTemporaryWorkspaceActive(
	workspaceId: string | undefined,
	workspaces: WorkspaceProjectMembership[],
	projects: ProjectKind[],
): boolean {
	if (!workspaceId) return false;
	const workspace = workspaces.find(
		(candidate) => candidate.id === workspaceId,
	);
	if (!workspace) return false;
	return projects.some(
		(project) =>
			project.id === workspace.projectId && project.kind === "temporary",
	);
}
