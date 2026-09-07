import { createFileRoute } from "@tanstack/react-router";
import { GlobalMcpPage } from "./components/GlobalMcpPage";

export const Route = createFileRoute("/_local/_dashboard/mcp/")({
	component: GlobalMcpPage,
});
