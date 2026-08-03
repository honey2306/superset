import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";

export function useCreateSectionFromWorkspaces() {
	const { createSectionFromWorkspaces } = useDashboardSidebarState();

	const mutate = useCallback(
		({
			projectId,
			workspaceIds,
			name = "New Section",
		}: {
			projectId: string;
			workspaceIds: string[];
			name?: string;
		}) => {
			try {
				createSectionFromWorkspaces(projectId, workspaceIds, name);
			} catch (error) {
				toast.error(
					`Failed to create section: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		},
		[createSectionFromWorkspaces],
	);

	return { mutate };
}
