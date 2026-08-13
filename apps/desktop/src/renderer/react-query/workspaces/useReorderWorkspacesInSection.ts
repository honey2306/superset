import { useCallback } from "react";
import { useDashboardSidebarState } from "renderer/routes/_local/hooks/useDashboardSidebarState";

interface ReorderCallbacks {
	onError?: (error: Error) => void;
	onSettled?: () => void;
	onSuccess?: () => void;
}

export function useReorderWorkspacesInSection() {
	const { reorderWorkspacesInSectionByIndex } = useDashboardSidebarState();

	const mutate = useCallback(
		(
			input: { sectionId: string; fromIndex: number; toIndex: number },
			callbacks?: ReorderCallbacks,
		) => {
			try {
				reorderWorkspacesInSectionByIndex(
					input.sectionId,
					input.fromIndex,
					input.toIndex,
				);
				callbacks?.onSuccess?.();
			} catch (error) {
				const normalizedError =
					error instanceof Error ? error : new Error(String(error));
				callbacks?.onError?.(normalizedError);
			} finally {
				callbacks?.onSettled?.();
			}
		},
		[reorderWorkspacesInSectionByIndex],
	);

	return { mutate };
}
