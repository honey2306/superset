import { createFileRoute } from "@tanstack/react-router";
import { NotFound } from "renderer/routes/not-found";
import { ProjectSettings } from "./components/ProjectSettings";

export const Route = createFileRoute("/_local/settings/projects/$projectId/")({
	component: ProjectDetailPage,
	notFoundComponent: NotFound,
	validateSearch: (search: Record<string, unknown>): { hostId?: string } => ({
		hostId: typeof search.hostId === "string" ? search.hostId : undefined,
	}),
});

function ProjectDetailPage() {
	const { projectId } = Route.useParams();
	const { hostId } = Route.useSearch();

	return <ProjectSettings projectId={projectId} hostId={hostId ?? null} />;
}
