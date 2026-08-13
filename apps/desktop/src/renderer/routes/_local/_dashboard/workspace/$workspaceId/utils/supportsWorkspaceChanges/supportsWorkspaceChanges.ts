interface WorkspaceChangesProject {
	kind: "repository" | "temporary";
	repoPath: string;
}

interface SupportsWorkspaceChangesInput {
	worktreePath: string | null | undefined;
	project: WorkspaceChangesProject | null;
}

const LEGACY_TEMPORARY_PROJECT_SUFFIX = "/Superset/temporary";

/**
 * Temporary projects created before their catalog identity was persisted can
 * still be marked as repositories. Keep the renderer compatible with those
 * rows until provisioning repairs them in the host-service catalog.
 */
export function supportsWorkspaceChanges({
	worktreePath,
	project,
}: SupportsWorkspaceChangesInput): boolean {
	if (!worktreePath || !project || project.kind === "temporary") return false;
	const normalizedRepoPath = project.repoPath.replaceAll("\\", "/");
	return !normalizedRepoPath.endsWith(LEGACY_TEMPORARY_PROJECT_SUFFIX);
}
