import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { useDashboardSidebarState } from "renderer/routes/_local/hooks/useDashboardSidebarState";

export interface MoveWorkspacesToSectionInput {
	workspaceIds: string[];
	projectId: string;
	sectionId: string | null;
	rootPlacement?: "top" | "bottom";
}

interface MutationCallbacks {
	onError?: (error: Error) => void;
	onSettled?: () => void;
	onSuccess?: () => void;
}

export function useMoveWorkspacesToSection() {
	const { moveWorkspacesToSection } = useDashboardSidebarState();

	const mutate = useCallback(
		(input: MoveWorkspacesToSectionInput, callbacks?: MutationCallbacks) => {
			try {
				moveWorkspacesToSection(
					input.workspaceIds,
					input.projectId,
					input.sectionId,
					input.rootPlacement,
				);
				callbacks?.onSuccess?.();
			} catch (error) {
				const normalizedError =
					error instanceof Error ? error : new Error(String(error));
				toast.error(`Failed to move workspaces: ${normalizedError.message}`);
				callbacks?.onError?.(normalizedError);
			} finally {
				callbacks?.onSettled?.();
			}
		},
		[moveWorkspacesToSection],
	);

	return { mutate };
}
