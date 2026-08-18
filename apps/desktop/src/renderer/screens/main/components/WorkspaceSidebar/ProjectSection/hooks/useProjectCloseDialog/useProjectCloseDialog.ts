import { useState } from "react";
import { useContextMenuDeleteDialogCoordinator } from "renderer/react-query/workspaces/useWorkspaceDeleteHandler";

/**
 * Coordinates a project-removal confirmation with Radix ContextMenu focus
 * restoration. Closing a project removes it from the sidebar only.
 */
export function useProjectCloseDialog() {
	const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
	const closeDialogCoordinator = useContextMenuDeleteDialogCoordinator(() => {
		setIsCloseDialogOpen(true);
	});

	return {
		isCloseDialogOpen,
		setIsCloseDialogOpen,
		closeDialogCoordinator,
	};
}
