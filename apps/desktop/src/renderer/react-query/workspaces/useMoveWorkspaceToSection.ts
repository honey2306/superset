import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";

export interface MoveWorkspaceToSectionInput {
	workspaceId: string;
	projectId: string;
	sectionId: string | null;
	rootPlacement?: "top" | "bottom";
}

interface MutationCallbacks {
	onError?: (error: Error) => void;
	onSettled?: () => void;
	onSuccess?: () => void;
}

export function useMoveWorkspaceToSection() {
	const { moveWorkspaceToSection, moveWorkspacesToSection } =
		useDashboardSidebarState();

	const mutate = useCallback(
		(input: MoveWorkspaceToSectionInput, callbacks?: MutationCallbacks) => {
			try {
				if (input.rootPlacement && input.sectionId === null) {
					moveWorkspacesToSection(
						[input.workspaceId],
						input.projectId,
						input.sectionId,
						input.rootPlacement,
					);
				} else {
					moveWorkspaceToSection(
						input.workspaceId,
						input.projectId,
						input.sectionId,
					);
				}
				callbacks?.onSuccess?.();
			} catch (error) {
				const normalizedError =
					error instanceof Error ? error : new Error(String(error));
				toast.error(`Failed to move workspace: ${normalizedError.message}`);
				callbacks?.onError?.(normalizedError);
			} finally {
				callbacks?.onSettled?.();
			}
		},
		[moveWorkspaceToSection, moveWorkspacesToSection],
	);

	return { mutate };
}
