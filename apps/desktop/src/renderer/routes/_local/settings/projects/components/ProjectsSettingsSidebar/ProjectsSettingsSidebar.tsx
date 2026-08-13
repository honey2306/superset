import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { ProjectThumbnail } from "renderer/routes/_local/components/ProjectThumbnail";
import { useCatalogProjects } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import {
	type SettingsListGroup,
	SettingsListSidebar,
	settingsListItemClass,
} from "../../../components/SettingsListSidebar";

interface ProjectRow {
	id: string;
	name: string;
	iconUrl: string | null;
}

interface ProjectsSettingsSidebarProps {
	selectedProjectId: string | null;
}

export function ProjectsSettingsSidebar({
	selectedProjectId,
}: ProjectsSettingsSidebarProps) {
	const { t } = useTranslation();
	const { projects } = useCatalogProjects();
	const listGroups = useMemo<SettingsListGroup<ProjectRow>[]>(
		() => [
			{
				id: "projects",
				title: "projects",
				rows: projects.map((project) => ({
					id: project.id,
					name: project.name,
					iconUrl: project.repoOwner
						? `https://github.com/${project.repoOwner}.png?size=64`
						: null,
				})),
			},
		],
		[projects],
	);

	return (
		<SettingsListSidebar
			searchPlaceholder={t("projects.filter")}
			searchAriaLabel={t("projects.filterAria")}
			hideFilterWhenEmpty
			groups={listGroups}
			filterRow={(row, q) => row.name.toLowerCase().includes(q.toLowerCase())}
			getRowKey={(row) => row.id}
			emptyLabel={t("projects.none")}
			noMatchLabel={(q) => t("projects.noMatch", { query: q })}
			renderRow={(row) => (
				<Link
					to="/settings/projects/$projectId"
					params={{ projectId: row.id }}
					className={settingsListItemClass(
						row.id === selectedProjectId,
						"gap-2",
					)}
				>
					<ProjectThumbnail
						projectName={row.name}
						iconUrl={row.iconUrl}
						className="size-5"
					/>
					<span className="truncate">{row.name}</span>
				</Link>
			)}
		/>
	);
}
