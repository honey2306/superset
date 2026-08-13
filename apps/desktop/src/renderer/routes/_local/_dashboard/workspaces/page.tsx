import { createFileRoute } from "@tanstack/react-router";
import { WorkspacesListView } from "renderer/screens/main/components/WorkspacesListView";

export const Route = createFileRoute("/_local/_dashboard/workspaces/")({
	component: WorkspacesPage,
});

function WorkspacesPage() {
	return <WorkspacesListView />;
}
