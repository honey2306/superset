import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useCatalogProjects } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";

export const Route = createFileRoute("/_local/settings/projects/")({
	component: ProjectsIndexPage,
});

function ProjectsIndexPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { projects, isReady } = useCatalogProjects();
	const firstProjectId = useMemo(
		() =>
			[...projects].sort((a, b) => a.name.localeCompare(b.name))[0]?.id ?? null,
		[projects],
	);

	useEffect(() => {
		if (firstProjectId) {
			navigate({
				to: "/settings/projects/$projectId",
				params: { projectId: firstProjectId },
				replace: true,
			});
		}
	}, [firstProjectId, navigate]);

	if (projects.length === 0) {
		if (!isReady) return null;
		return (
			<div className="flex items-center justify-center h-full p-6 text-sm text-fg-mute">
				{t("projects.none")}
			</div>
		);
	}

	return null;
}
