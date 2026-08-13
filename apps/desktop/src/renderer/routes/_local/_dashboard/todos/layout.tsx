import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_local/_dashboard/todos")({
	component: TodosLayout,
});

function TodosLayout() {
	return <Outlet />;
}
