import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { useDashboardSidebarState } from "renderer/routes/_local/hooks/useDashboardSidebarState";
import { useWorkspaceSidebarStore } from "renderer/stores";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { PROJECT_DND_TYPE } from "../constants";
import { useSectionDropZone } from "../hooks";
import type {
	ProjectDragItem,
	SidebarSection,
	SidebarWorkspace,
} from "../types";
import { WorkspaceListItem } from "../WorkspaceListItem";
import { WorkspaceSection } from "../WorkspaceSection";
import { ProjectHeader } from "./ProjectHeader";

type TopLevelChild =
	| {
			kind: "workspace";
			workspace: SidebarWorkspace;
			topLevelIndex: number;
			shortcutIndex: number;
	  }
	| {
			kind: "section";
			section: SidebarSection;
			topLevelIndex: number;
			shortcutBaseIndex: number;
	  };

interface ProjectSectionProps {
	projectId: string;
	projectName: string;
	projectColor: string;
	githubOwner: string | null;
	mainRepoPath: string;
	hideImage: boolean;
	iconUrl: string | null;
	workspaces: SidebarWorkspace[];
	sections: SidebarSection[];
	topLevelItems: {
		id: string;
		kind: "workspace" | "section";
		tabOrder: number;
	}[];
	/** Base index for keyboard shortcuts (0-based) */
	shortcutBaseIndex: number;
	/** Index within the currently visible project list */
	index: number;
	/** IDs in the same visible order represented by index */
	orderedProjectIds: string[];
	projectGroupId: string | null;
	availableProjectGroups: Array<{ id: string; name: string }>;
	/** Whether the sidebar is in collapsed mode */
	isCollapsed?: boolean;
}

export function ProjectSection({
	projectId,
	projectName,
	projectColor,
	githubOwner,
	mainRepoPath,
	hideImage,
	iconUrl,
	workspaces,
	sections,
	topLevelItems,
	shortcutBaseIndex,
	index,
	orderedProjectIds,
	projectGroupId,
	availableProjectGroups,
	isCollapsed: isSidebarCollapsed = false,
}: ProjectSectionProps) {
	const { isProjectCollapsed, toggleProjectCollapsed } =
		useWorkspaceSidebarStore();
	const { moveProjectToGroup, reorderProjects } = useDashboardSidebarState();
	const openModal = useOpenNewWorkspaceModal();

	const isCollapsed = isProjectCollapsed(projectId);
	const projectWorkspaces = [
		...new Map(
			[...workspaces, ...sections.flatMap((section) => section.workspaces)].map(
				(workspace) => [workspace.id, workspace],
			),
		).values(),
	];
	const totalWorkspaceCount = projectWorkspaces.length;
	const singleWorkspace =
		totalWorkspaceCount === 1 ? projectWorkspaces[0] : undefined;

	const { orderedWorkspaceIds, topLevelChildren } = useMemo(() => {
		const topLevelWorkspacesById = new Map(
			workspaces.map((workspace) => [workspace.id, workspace]),
		);
		const sectionsById = new Map(
			sections.map((section) => [section.id, section]),
		);
		const ids: string[] = [];
		let shortcutOffset = shortcutBaseIndex;
		const renderables: TopLevelChild[] = [];

		for (const [topLevelIndex, item] of topLevelItems.entries()) {
			if (item.kind === "workspace") {
				const workspace = topLevelWorkspacesById.get(item.id);
				if (!workspace) continue;
				ids.push(workspace.id);
				const shortcutIndex = shortcutOffset;
				shortcutOffset += 1;
				renderables.push({
					kind: "workspace",
					workspace,
					topLevelIndex,
					shortcutIndex,
				});
				continue;
			}

			const section = sectionsById.get(item.id);
			if (!section) continue;
			for (const workspace of section.workspaces) {
				ids.push(workspace.id);
			}
			renderables.push({
				kind: "section",
				section,
				topLevelIndex,
				shortcutBaseIndex: shortcutOffset,
			});
			shortcutOffset += section.workspaces.length;
		}

		return {
			orderedWorkspaceIds: ids,
			topLevelChildren: renderables,
		};
	}, [shortcutBaseIndex, sections, topLevelItems, workspaces]);

	const topUngroupedDropZone = useSectionDropZone({
		projectId,
		canAccept: (item) =>
			item.sectionId !== null && item.projectId === projectId,
		targetSectionId: null,
		targetRootPlacement: "top",
	});

	const bottomUngroupedDropZone = useSectionDropZone({
		projectId,
		canAccept: (item) =>
			item.sectionId !== null && item.projectId === projectId,
		targetSectionId: null,
		targetRootPlacement: "bottom",
	});
	const showRootDropZones =
		topUngroupedDropZone.isDropTarget || bottomUngroupedDropZone.isDropTarget;

	const getRootDropZoneClassName = (
		isDropTarget: boolean,
		isDragOver: boolean,
	) =>
		cn(
			"transition-colors rounded-sm",
			isDropTarget && !isDragOver && "border border-dashed border-primary/20",
			isDragOver && "bg-accent-tint border border-solid border-primary/30",
		);

	const handleNewWorkspace = () => {
		openModal(projectId);
	};

	const commitProjectReorder = useCallback(
		(item: ProjectDragItem) => {
			if (item.projectGroupId !== projectGroupId) {
				try {
					moveProjectToGroup(item.projectId, projectGroupId, item.index);
					return true;
				} catch (error) {
					toast.error(
						`Failed to move project: ${error instanceof Error ? error.message : String(error)}`,
					);
					return false;
				}
			}

			const fromIndex = orderedProjectIds.indexOf(item.projectId);
			if (
				fromIndex === -1 ||
				item.index < 0 ||
				item.index >= orderedProjectIds.length ||
				fromIndex === item.index
			) {
				return false;
			}

			const nextProjectIds = [...orderedProjectIds];
			const [movedProjectId] = nextProjectIds.splice(fromIndex, 1);
			if (!movedProjectId) return false;
			nextProjectIds.splice(item.index, 0, movedProjectId);

			try {
				reorderProjects(nextProjectIds);
				return true;
			} catch (error) {
				toast.error(
					`Failed to reorder: ${error instanceof Error ? error.message : String(error)}`,
				);
				return false;
			}
		},
		[moveProjectToGroup, orderedProjectIds, projectGroupId, reorderProjects],
	);

	const [{ isDragging, sourceHandlerId }, drag] = useDrag(
		() => ({
			type: PROJECT_DND_TYPE,
			item: (): ProjectDragItem => ({
				kind: "project",
				projectId,
				projectGroupId,
				index,
				originalIndex: index,
			}),
			end: (item, monitor) => {
				if (!item || item.handled || monitor.didDrop()) return;
				commitProjectReorder(item);
			},
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
				sourceHandlerId: monitor.getHandlerId(),
			}),
		}),
		[projectId, projectGroupId, index, commitProjectReorder],
	);

	const [{ targetHandlerId }, drop] = useDrop(
		() => ({
			accept: PROJECT_DND_TYPE,
			hover: (item: ProjectDragItem) => {
				if (item.projectGroupId !== projectGroupId || item.index === index) {
					return;
				}
				item.index = index;
				item.handled = commitProjectReorder(item);
			},
			drop: (item: ProjectDragItem) => {
				if (item.handled || commitProjectReorder(item)) {
					return { reordered: true };
				}
			},
			collect: (monitor) => ({ targetHandlerId: monitor.getHandlerId() }),
		}),
		[index, projectGroupId, commitProjectReorder],
	);

	const projectDropRef = useRef<HTMLDivElement>(null);
	const projectDragRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		drop(projectDropRef);
		drag(projectDragRef);
	}, [drag, drop]);

	if (isSidebarCollapsed) {
		return (
			<div
				ref={projectDropRef}
				data-dnd-target-id={targetHandlerId ?? undefined}
				className={cn(
					"flex flex-col items-center py-2 border-b border-line last:border-b-0",
					isDragging && "opacity-30",
				)}
			>
				<div
					ref={projectDragRef}
					data-dnd-source-id={sourceHandlerId ?? undefined}
					className={cn(
						"flex w-full cursor-grab justify-center",
						isDragging && "cursor-grabbing",
					)}
				>
					<ProjectHeader
						singleWorkspace={singleWorkspace}
						workspaceSections={sections}
						projectId={projectId}
						projectGroupId={projectGroupId}
						availableProjectGroups={availableProjectGroups}
						projectName={projectName}
						projectColor={projectColor}
						githubOwner={githubOwner}
						mainRepoPath={mainRepoPath}
						hideImage={hideImage}
						iconUrl={iconUrl}
						isCollapsed={isCollapsed}
						isSidebarCollapsed={isSidebarCollapsed}
						onToggleCollapse={() => toggleProjectCollapsed(projectId)}
						workspaceCount={totalWorkspaceCount}
						onNewWorkspace={handleNewWorkspace}
					/>
				</div>
				<AnimatePresence initial={false}>
					{!singleWorkspace && !isCollapsed && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
							className="overflow-hidden w-full"
						>
							<div className="flex flex-col items-center gap-1 pt-1">
								{showRootDropZones && topLevelChildren.length > 0 && (
									<div
										{...topUngroupedDropZone.handlers}
										className={cn(
											"w-full h-5",
											getRootDropZoneClassName(
												topUngroupedDropZone.isDropTarget,
												topUngroupedDropZone.isDragOver,
											),
										)}
									/>
								)}
								{topLevelChildren.map((item) =>
									item.kind === "workspace" ? (
										<WorkspaceListItem
											key={item.workspace.id}
											id={item.workspace.id}
											projectId={item.workspace.projectId}
											worktreePath={item.workspace.worktreePath}
											name={item.workspace.name}
											branch={item.workspace.branch}
											type={item.workspace.type}
											isUnread={item.workspace.isUnread}
											index={item.topLevelIndex}
											shortcutIndex={item.shortcutIndex}
											isCollapsed={isSidebarCollapsed}
											sectionId={null}
											sections={sections}
											orderedWorkspaceIds={orderedWorkspaceIds}
										/>
									) : (
										<WorkspaceSection
											key={item.section.id}
											sectionId={item.section.id}
											projectId={projectId}
											index={item.topLevelIndex}
											name={item.section.name}
											isCollapsed={item.section.isCollapsed}
											color={item.section.color}
											workspaces={item.section.workspaces}
											shortcutBaseIndex={item.shortcutBaseIndex}
											isSidebarCollapsed
											allSections={sections}
											orderedWorkspaceIds={orderedWorkspaceIds}
										/>
									),
								)}
								{showRootDropZones && topLevelChildren.length > 0 && (
									<div
										{...bottomUngroupedDropZone.handlers}
										className={cn(
											"w-full h-5",
											getRootDropZoneClassName(
												bottomUngroupedDropZone.isDropTarget,
												bottomUngroupedDropZone.isDragOver,
											),
										)}
									/>
								)}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		);
	}

	return (
		<div
			ref={projectDropRef}
			data-dnd-target-id={targetHandlerId ?? undefined}
			// 行盒左缘挂在组 guide（21px）右侧 4px，右缘留 6px inset
			className={cn(
				"relative ml-[25px] mr-[6px] mb-2.5",
				isDragging && "opacity-30",
			)}
		>
			{/* guide 竖线按项目分段：线段只跟着自己这一个项目，
			    项目之间的缺口就是边界——不用卡片也不用加留白 */}
			<div
				aria-hidden="true"
				className="absolute -left-1 top-0 bottom-0 w-px bg-line-strong"
			/>
			<div
				ref={projectDragRef}
				data-dnd-source-id={sourceHandlerId ?? undefined}
				className={cn("w-full cursor-grab", isDragging && "cursor-grabbing")}
			>
				<ProjectHeader
					singleWorkspace={singleWorkspace}
					workspaceSections={sections}
					projectId={projectId}
					projectGroupId={projectGroupId}
					availableProjectGroups={availableProjectGroups}
					projectName={projectName}
					projectColor={projectColor}
					githubOwner={githubOwner}
					mainRepoPath={mainRepoPath}
					hideImage={hideImage}
					iconUrl={iconUrl}
					isCollapsed={isCollapsed}
					isSidebarCollapsed={isSidebarCollapsed}
					onToggleCollapse={() => toggleProjectCollapsed(projectId)}
					workspaceCount={totalWorkspaceCount}
					onNewWorkspace={handleNewWorkspace}
				/>
			</div>

			<AnimatePresence initial={false}>
				{!singleWorkspace && !isCollapsed && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="relative overflow-hidden"
					>
						{/* 二级 guide：竖线从项目状态点正下方落下（侧栏 40px = 容器内 15px），
						    子 workspace 挂在它上面——两级缩进各有各的锚点 */}
						<div
							aria-hidden="true"
							className="absolute left-[15px] top-0 bottom-1 w-px bg-line"
						/>
						<div className="pb-1">
							{showRootDropZones && topLevelChildren.length === 0 && (
								<div
									{...topUngroupedDropZone.handlers}
									className={cn(
										"transition-colors rounded-sm min-h-8",
										getRootDropZoneClassName(
											topUngroupedDropZone.isDropTarget,
											topUngroupedDropZone.isDragOver,
										),
									)}
								/>
							)}
							{showRootDropZones && topLevelChildren.length > 0 && (
								<div
									{...topUngroupedDropZone.handlers}
									className={cn(
										"h-5",
										getRootDropZoneClassName(
											topUngroupedDropZone.isDropTarget,
											topUngroupedDropZone.isDragOver,
										),
									)}
								/>
							)}
							{topLevelChildren.map((item) =>
								item.kind === "workspace" ? (
									<WorkspaceListItem
										key={item.workspace.id}
										id={item.workspace.id}
										projectId={item.workspace.projectId}
										worktreePath={item.workspace.worktreePath}
										name={item.workspace.name}
										branch={item.workspace.branch}
										type={item.workspace.type}
										isUnread={item.workspace.isUnread}
										index={item.topLevelIndex}
										shortcutIndex={item.shortcutIndex}
										sectionId={null}
										sections={sections}
										orderedWorkspaceIds={orderedWorkspaceIds}
									/>
								) : (
									<WorkspaceSection
										key={item.section.id}
										sectionId={item.section.id}
										projectId={projectId}
										index={item.topLevelIndex}
										name={item.section.name}
										isCollapsed={item.section.isCollapsed}
										color={item.section.color}
										workspaces={item.section.workspaces}
										shortcutBaseIndex={item.shortcutBaseIndex}
										allSections={sections}
										orderedWorkspaceIds={orderedWorkspaceIds}
									/>
								),
							)}
							{showRootDropZones && topLevelChildren.length > 0 && (
								<div
									{...bottomUngroupedDropZone.handlers}
									className={cn(
										"h-5",
										getRootDropZoneClassName(
											bottomUngroupedDropZone.isDropTarget,
											bottomUngroupedDropZone.isDragOver,
										),
									)}
								/>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
