import { createFileRoute } from "@tanstack/react-router";
import { ProjectMemoryPage } from "./components/ProjectMemoryPage";

export const Route = createFileRoute("/_local/_dashboard/memories/")({
	component: ProjectMemoryPage,
});
