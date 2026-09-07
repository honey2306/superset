import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_local/_dashboard/skills")({
	component: GlobalSkillsLayout,
});

function GlobalSkillsLayout() {
	return <Outlet />;
}
