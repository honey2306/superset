import { createFileRoute } from "@tanstack/react-router";
import { GlobalSkillsPage } from "./components/GlobalSkillsPage";

export const Route = createFileRoute("/_local/_dashboard/skills/")({
	component: GlobalSkillsPage,
});
