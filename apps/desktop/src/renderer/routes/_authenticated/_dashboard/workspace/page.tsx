import { Spinner } from "@superset/ui/spinner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useWorkspaceCatalog } from "../../providers/WorkspaceCatalogProvider";

export const Route = createFileRoute("/_authenticated/_dashboard/workspace/")({
	component: WorkspaceIndexPage,
});

function LoadingSpinner() {
	return (
		<div className="flex h-full w-full items-center justify-center">
			<Spinner className="size-5" />
		</div>
	);
}

function WorkspaceIndexPage() {
	const navigate = useNavigate();
	const { workspaces, isReady } = useWorkspaceCatalog();
	const hasNoWorkspaces = isReady && workspaces.length === 0;

	useEffect(() => {
		if (!isReady) return;

		if (workspaces.length === 0) {
			// No workspaces yet: land on the projects list, which has the sidebar
			// "Add repository" entry points.
			navigate({ to: "/workspaces", replace: true });
			return;
		}

		// Try to restore last viewed workspace
		const lastViewedId = localStorage.getItem("lastViewedWorkspaceId");
		const targetWorkspace =
			workspaces.find((w) => w.id === lastViewedId) ?? workspaces[0];

		if (targetWorkspace) {
			navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: targetWorkspace.id },
				replace: true,
			});
		}
	}, [workspaces, isReady, navigate]);

	if (hasNoWorkspaces) {
		return <LoadingSpinner />;
	}

	return <LoadingSpinner />;
}
