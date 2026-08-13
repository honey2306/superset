import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { ProjectThumbnail } from "renderer/routes/_local/components/ProjectThumbnail";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import { SettingsRow } from "../../../../components/SettingsRow";
import { BranchPrefixSection } from "./components/BranchPrefixSection";
import { DeleteProjectSection } from "./components/DeleteProjectSection";
import { NameSection } from "./components/NameSection";
import { ProjectLocationSection } from "./components/ProjectLocationSection";
import { RepositorySection } from "./components/RepositorySection";
import { ScriptsEditor } from "./components/ScriptsEditor";
import { SparseCheckoutSection } from "./components/SparseCheckoutSection";
import { WorktreeLocationSection } from "./components/WorktreeLocationSection";

interface ProjectSettingsProps {
	projectId: string;
	hostId: string | null;
}

export function ProjectSettings({
	projectId,
	hostId: _hostId,
}: ProjectSettingsProps) {
	const { t } = useTranslation();
	const { machineId: targetHostId, activeHostUrl: targetHostUrl } =
		useLocalHostService();

	// Projects are fully local — identity comes from the host fan-out.
	const { projects: hostProjects, isReady } = useWorkspaceCatalog();
	const project = useMemo(
		() => hostProjects.find((item) => item.id === projectId) ?? null,
		[hostProjects, projectId],
	);

	const targetHostName = t("project.thisDeviceLower");

	const { data: hostProject, refetch: refetchHostProject } = useQuery({
		queryKey: ["host-project", "get", targetHostUrl, projectId],
		enabled: !!targetHostUrl,
		queryFn: async () => {
			if (!targetHostUrl) return null;
			const client = getHostServiceClientByUrl(targetHostUrl);
			return client.project.get.query({ projectId });
		},
	});
	// External renames land on the merged fan-out item via project:changed;
	// re-pull the targeted host's row so host-sourced fields (Name) follow.
	const mergedUpdatedAt = project?.updatedAt;
	useEffect(() => {
		if (mergedUpdatedAt === undefined) return;
		void refetchHostProject();
	}, [mergedUpdatedAt, refetchHostProject]);

	if (!project) {
		if (!isReady) return null;
		return (
			<div className="p-6 text-sm text-fg-mute select-text cursor-text">
				{t("project.notFound")}
			</div>
		);
	}

	const iconUrl = project.repoOwner
		? `https://github.com/${project.repoOwner}.png?size=64`
		: null;
	const canRename = Boolean(targetHostUrl);

	return (
		<div className="p-6 max-w-4xl w-full mx-auto select-text">
			<header className="mb-8 flex items-center gap-3">
				<ProjectThumbnail projectName={project.name} iconUrl={iconUrl} />
				<h2 className="truncate text-xl font-semibold">{project.name}</h2>
			</header>

			<div className="space-y-10">
				<section>
					<SettingsRow label={t("project.name")} htmlFor="project-name">
						<NameSection
							projectId={projectId}
							// The targeted host's own name, not the cross-host merged
							// one — the rename commits to that host, so a newer name
							// from another replica must not seed (and overwrite) it.
							currentName={hostProject?.name ?? project.name}
							hostUrl={targetHostUrl}
							canRename={canRename}
							onRenamed={() => refetchHostProject()}
						/>
					</SettingsRow>
					<SettingsRow label={t("project.repository")} htmlFor="project-repo">
						<RepositorySection repoUrl={project.repoUrl} />
					</SettingsRow>
					{targetHostUrl && hostProject && (
						<SettingsRow
							label={t("project.branchPrefix")}
							hint={t("project.branchPrefixHint")}
						>
							<BranchPrefixSection
								projectId={projectId}
								hostUrl={targetHostUrl}
								mode={hostProject.branchPrefixMode ?? null}
								customPrefix={hostProject.branchPrefixCustom ?? null}
								onChanged={() => refetchHostProject()}
							/>
						</SettingsRow>
					)}
				</section>

				<section>
					<SettingsRow label={t("project.location")}>
						<ProjectLocationSection
							projectId={projectId}
							projectName={project.name}
							currentPath={hostProject?.repoPath ?? null}
							repoCloneUrl={project.repoUrl}
							hostId={targetHostId ?? null}
							hostUrl={targetHostUrl}
							hostName={targetHostName}
							onChanged={() => refetchHostProject()}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("project.worktrees")}
						hint={t("project.worktreesHint")}
					>
						<WorktreeLocationSection
							projectId={projectId}
							currentPath={hostProject?.worktreeBaseDir ?? null}
							hostUrl={targetHostUrl}
							isHostOnline={Boolean(targetHostUrl)}
							isProjectSetup={Boolean(hostProject)}
							onChanged={() => refetchHostProject()}
						/>
					</SettingsRow>
					{targetHostUrl && (
						<div className="pt-4">
							<div className="mb-3">
								<h3 className="text-sm font-medium">Sparse checkout</h3>
								<p className="mt-0.5 text-xs text-fg-mute">
									Limit new worktrees to selected folders.
								</p>
							</div>
							<SparseCheckoutSection
								projectId={projectId}
								hostUrl={targetHostUrl}
								paths={hostProject?.sparseCheckoutPaths ?? []}
								onChanged={() => refetchHostProject()}
							/>
						</div>
					)}
					{targetHostUrl && (
						<div className="pt-4">
							<div className="mb-3">
								<h3 className="text-sm font-medium">{t("project.scripts")}</h3>
								<p className="mt-0.5 text-xs text-fg-mute">
									{t("project.scriptsHint")}
								</p>
							</div>
							<ScriptsEditor hostUrl={targetHostUrl} projectId={projectId} />
						</div>
					)}
				</section>

				<section>
					<DeleteProjectSection
						projectId={projectId}
						projectName={project.name}
						hostIds={targetHostId ? [targetHostId] : []}
					/>
				</section>
			</div>
		</div>
	);
}
