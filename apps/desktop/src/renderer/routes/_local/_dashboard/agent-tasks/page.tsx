import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AgentTasksPage } from "./components/AgentTasksPage/AgentTasksPage";

export const Route = createFileRoute("/_local/_dashboard/agent-tasks/")({
	validateSearch: (search: Record<string, unknown>): { taskId?: string } => ({
		taskId: typeof search.taskId === "string" ? search.taskId : undefined,
	}),
	component: Page,
});
function Page() {
	const { taskId } = Route.useSearch();
	const navigate = useNavigate();
	return (
		<AgentTasksPage
			selectedId={taskId}
			onSelect={(id) =>
				void navigate({ to: "/agent-tasks", search: { taskId: id } })
			}
		/>
	);
}
