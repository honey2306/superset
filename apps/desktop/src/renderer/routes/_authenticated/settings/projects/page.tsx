import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useCatalogProjects } from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider/selectors";

export const Route = createFileRoute("/_authenticated/settings/projects/")({
	component: ProjectsIndexPage,
});

function ProjectsIndexPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const isV2CloudEnabled = useIsV2CloudEnabled();

	// Projects are fully local — identity comes from the host fan-out.
	const { projects: hostProjects, isReady } = useHostProjects();
	const { projects: catalogProjects, isReady: catalogProjectsReady } =
		useCatalogProjects();
	const v2Projects = useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
			})),
		[hostProjects],
	);

	const firstProjectId = useMemo(() => {
		if (isV2CloudEnabled) {
			const v2Sorted = [...v2Projects].sort((a, b) =>
				a.name.localeCompare(b.name),
			);
			return v2Sorted[0]?.id ?? null;
		}

		const v1Sorted = [...catalogProjects].sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		return v1Sorted[0]?.id ?? null;
	}, [v2Projects, catalogProjects, isV2CloudEnabled]);

	useEffect(() => {
		if (firstProjectId) {
			navigate({
				to: "/settings/projects/$projectId",
				params: { projectId: firstProjectId },
				replace: true,
			});
		}
	}, [firstProjectId, navigate]);

	const isEmpty = isV2CloudEnabled
		? v2Projects.length === 0
		: catalogProjects.length === 0;
	if (isEmpty) {
		if (isV2CloudEnabled ? !isReady : !catalogProjectsReady) return null;
		return (
			<div className="flex items-center justify-center h-full p-6 text-sm text-fg-mute">
				{t("projects.none")}
			</div>
		);
	}

	return null;
}
