import { createFileRoute } from "@tanstack/react-router";
import { TasksView } from "./components/TasksView";
import { Route as TasksLayoutRoute } from "./layout";

export const Route = createFileRoute("/_local/_dashboard/tasks/")({
	component: TasksPage,
});

function TasksPage() {
	const { search, type, project } = TasksLayoutRoute.useSearch();
	return (
		<TasksView
			initialSearch={search}
			initialType={type}
			initialProject={project}
		/>
	);
}
