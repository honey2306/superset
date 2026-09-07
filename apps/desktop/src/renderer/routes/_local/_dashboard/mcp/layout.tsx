import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_local/_dashboard/mcp")({
	component: GlobalMcpLayout,
});

function GlobalMcpLayout() {
	return <Outlet />;
}
