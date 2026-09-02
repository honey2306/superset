import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceShortcuts } from "renderer/hooks/useWorkspaceShortcuts";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useDashboardSidebarState } from "renderer/routes/_local/hooks/useDashboardSidebarState";
import { useWorkspaceSelectionStore } from "renderer/stores/workspace-selection";
import { MultiDragPreview } from "./MultiDragPreview";
import { PortsList } from "./PortsList";
import { ProjectGroupSection } from "./ProjectGroupSection";
import { ProjectSection } from "./ProjectSection";
import { SetupScriptCard } from "./SetupScriptCard";
import { SidebarDropZone } from "./SidebarDropZone";
import { WorkspaceSidebarFooter } from "./WorkspaceSidebarFooter";
import { WorkspaceSidebarHeader } from "./WorkspaceSidebarHeader";

interface WorkspaceSidebarProps {
	isCollapsed?: boolean;
	activeProjectId: string | null;
	activeProjectName: string | null;
}

export function WorkspaceSidebar({
	isCollapsed = false,
	activeProjectId,
	activeProjectName,
}: WorkspaceSidebarProps) {
	const { t } = useTranslation();
	const { groups, projectGroups, ungroupedProjects } = useWorkspaceShortcuts();
	const { toggleProjectGroupCollapsed } = useDashboardSidebarState();
	const [isUngroupedCollapsed, setIsUngroupedCollapsed] = useState(false);
	const clearSelection = useWorkspaceSelectionStore((s) => s.clearSelection);

	const orderedProjectIds = useMemo(
		() => groups.map((group) => group.project.id),
		[groups],
	);
	const orderedProjectGroupIds = useMemo(
		() => projectGroups.map((projectGroup) => projectGroup.group.id),
		[projectGroups],
	);
	const availableProjectGroups = useMemo(
		() =>
			projectGroups.map((projectGroup) => ({
				id: projectGroup.group.id,
				name: projectGroup.group.name,
			})),
		[projectGroups],
	);

	const projectShortcutIndexById = useMemo(() => {
		let cumulative = 0;
		const indices = new Map<string, number>();
		for (const group of groups) {
			indices.set(group.project.id, cumulative);
			cumulative +=
				group.workspaces.length +
				(group.sections ?? []).reduce(
					(sum, section) => sum + section.workspaces.length,
					0,
				);
		}
		return indices;
	}, [groups]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (
					(e.target as HTMLElement).closest(
						"input, textarea, [contenteditable]",
					)
				)
					return;
				clearSelection();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [clearSelection]);

	const handleSidebarMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (
				(e.target as HTMLElement).closest("[role='button'], button, a, input")
			) {
				return;
			}
			clearSelection();
		},
		[clearSelection],
	);

	const renderProjectSection = (
		group: (typeof groups)[number],
		index: number,
		projectIds: string[],
		projectGroupId: string | null,
	) => (
		<ProjectSection
			key={group.project.id}
			projectId={group.project.id}
			projectGroupId={projectGroupId}
			availableProjectGroups={availableProjectGroups}
			projectName={group.project.name}
			projectColor={group.project.color}
			githubOwner={group.project.githubOwner}
			mainRepoPath={group.project.mainRepoPath}
			hideImage={group.project.hideImage}
			iconUrl={group.project.iconUrl}
			workspaces={group.workspaces}
			sections={group.sections ?? []}
			topLevelItems={group.topLevelItems}
			shortcutBaseIndex={projectShortcutIndexById.get(group.project.id) ?? 0}
			index={index}
			orderedProjectIds={projectIds}
			isCollapsed={isCollapsed}
		/>
	);

	return (
		<SidebarDropZone className="flex flex-col h-full bg-hover/45 dark:bg-hover/35">
			<WorkspaceSidebarHeader isCollapsed={isCollapsed} />

			{/* biome-ignore lint/a11y/noStaticElementInteractions: mousedown on empty sidebar space clears selection */}
			<div
				className="flex-1 overflow-y-auto hide-scrollbar"
				onMouseDown={handleSidebarMouseDown}
			>
				{isCollapsed || projectGroups.length === 0 ? (
					groups.map((group, index) =>
						renderProjectSection(
							group,
							index,
							orderedProjectIds,
							group.project.projectGroupId,
						),
					)
				) : (
					<>
						{projectGroups.map((projectGroup, projectGroupIndex) => {
							const projectIds = projectGroup.projects.map(
								(project) => project.project.id,
							);
							return (
								<ProjectGroupSection
									key={projectGroup.group.id}
									projectGroupId={projectGroup.group.id}
									name={projectGroup.group.name}
									projectCount={projectGroup.projects.length}
									isCollapsed={projectGroup.group.isCollapsed}
									index={projectGroupIndex}
									orderedProjectGroupIds={orderedProjectGroupIds}
									onToggleCollapsed={() =>
										toggleProjectGroupCollapsed(projectGroup.group.id)
									}
								>
									{projectGroup.projects.map((group, index) =>
										renderProjectSection(
											group,
											index,
											projectIds,
											projectGroup.group.id,
										),
									)}
								</ProjectGroupSection>
							);
						})}
						{ungroupedProjects.length > 0 && (
							<ProjectGroupSection
								projectGroupId={null}
								name={t("workspace.ungroupedProjects")}
								projectCount={ungroupedProjects.length}
								isCollapsed={isUngroupedCollapsed}
								index={projectGroups.length}
								orderedProjectGroupIds={orderedProjectGroupIds}
								onToggleCollapsed={() =>
									setIsUngroupedCollapsed((collapsed) => !collapsed)
								}
							>
								{ungroupedProjects.map((group, index) =>
									renderProjectSection(
										group,
										index,
										ungroupedProjects.map((project) => project.project.id),
										null,
									),
								)}
							</ProjectGroupSection>
						)}
					</>
				)}

				{groups.length === 0 && !isCollapsed && (
					<div className="flex flex-col items-center justify-center h-32 text-fg-mute text-sm">
						<span>{t("workspace.none")}</span>
						<span className="text-xs mt-1">{t("workspace.noneHint")}</span>
					</div>
				)}
			</div>

			{!isCollapsed && <PortsList />}

			<SetupScriptCard
				isCollapsed={isCollapsed}
				projectId={activeProjectId}
				projectName={activeProjectName}
			/>

			<WorkspaceSidebarFooter isCollapsed={isCollapsed} />
			<MultiDragPreview />
		</SidebarDropZone>
	);
}
