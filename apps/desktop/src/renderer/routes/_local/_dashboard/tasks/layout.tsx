import { createFileRoute, Outlet } from "@tanstack/react-router";

export type TasksSearch = {
	search?: string;
	type?: "prs" | "issues";
	project?: string;
};

export const Route = createFileRoute("/_local/_dashboard/tasks")({
	component: TasksLayout,
	validateSearch: (search: Record<string, unknown>): TasksSearch => ({
		search: typeof search.search === "string" ? search.search : undefined,
		type: ["prs", "issues"].includes(search.type as string)
			? (search.type as TasksSearch["type"])
			: undefined,
		project: typeof search.project === "string" ? search.project : undefined,
	}),
});

function TasksLayout() {
	return <Outlet />;
}
