import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AgentContextTabs } from "../components/AgentContextTabs";

export const Route = createFileRoute("/_local/_dashboard/memories")({
	component: ProjectMemoriesLayout,
});

function ProjectMemoriesLayout() {
	return (
		<div className="flex h-full min-h-0 w-full flex-col">
			<AgentContextTabs />
			<div className="min-h-0 flex-1">
				<Outlet />
			</div>
		</div>
	);
}
