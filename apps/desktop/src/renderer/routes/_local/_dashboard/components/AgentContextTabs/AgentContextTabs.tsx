import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "renderer/providers/I18nProvider";

export type AgentContextSection = "memories" | "mcp" | "skills";

export function getAgentContextSection(pathname: string): AgentContextSection {
	if (pathname.startsWith("/mcp")) return "mcp";
	if (pathname.startsWith("/skills")) return "skills";
	return "memories";
}

export function AgentContextTabs() {
	const { t } = useTranslation();
	const pathname = useLocation({ select: (location) => location.pathname });
	const activeSection = getAgentContextSection(pathname);

	return (
		<header className="flex h-[51px] shrink-0 items-center gap-5 border-b border-line px-5">
			<span className="text-sm font-semibold">
				{t("workspace.agentContext")}
			</span>
			<Tabs value={activeSection} className="h-full gap-0">
				<TabsList
					aria-label={t("workspace.agentContext")}
					className="h-full border-b-0"
				>
					<TabsTrigger value="memories" asChild>
						<Link to="/memories">{t("agentContext.memory")}</Link>
					</TabsTrigger>
					<TabsTrigger value="mcp" asChild>
						<Link to="/mcp">{t("agentContext.mcp")}</Link>
					</TabsTrigger>
					<TabsTrigger value="skills" asChild>
						<Link to="/skills">{t("agentContext.skills")}</Link>
					</TabsTrigger>
				</TabsList>
			</Tabs>
		</header>
	);
}
