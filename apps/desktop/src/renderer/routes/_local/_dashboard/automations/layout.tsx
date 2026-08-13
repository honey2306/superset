import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_local/_dashboard/automations")({
	component: AutomationsLayout,
});

function AutomationsLayout() {
	return <Outlet />;
}
