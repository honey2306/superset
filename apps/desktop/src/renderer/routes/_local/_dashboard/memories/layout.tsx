import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_local/_dashboard/memories")({
	component: ProjectMemoriesLayout,
});

function ProjectMemoriesLayout() {
	return <Outlet />;
}
