import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";

export function useHostWorkspaceIdForCwd(cwd: string): string | null {
	const { workspaces } = useWorkspaceCatalog();
	return (
		workspaces.find((workspace) => workspace.worktreePath === cwd)?.id ?? null
	);
}
