import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate, useParams } from "@tanstack/react-router";
import { HiChevronRight, HiMiniPlus } from "react-icons/hi2";
import {
	LuFolderOpen,
	LuImage,
	LuImageOff,
	LuListPlus,
	LuPalette,
	LuPencil,
	LuSettings,
	LuX,
} from "react-icons/lu";
import { ColorSelector } from "renderer/components/ColorSelector";
import {
	disposeHostSessionsForWorkspace,
	toastDisposeFailures,
} from "renderer/lib/dispose-host-sessions";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useUpdateProject } from "renderer/react-query/projects/useUpdateProject";
import { navigateToWorkspace } from "renderer/routes/_local/_dashboard/utils/workspace-navigation";
import { useDashboardSidebarState } from "renderer/routes/_local/hooks/useDashboardSidebarState";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import { useProjectRename } from "renderer/screens/main/hooks/useProjectRename";
import { STROKE_WIDTH } from "../constants";
import { RenameInput } from "../RenameInput";
import { CloseProjectDialog } from "./CloseProjectDialog";
import { useProjectCloseDialog } from "./hooks/useProjectCloseDialog";
import { ProjectThumbnail } from "./ProjectThumbnail";
import { closeProjectImmediately } from "./projectCloseOrchestration";

interface ProjectHeaderProps {
	projectId: string;
	projectName: string;
	projectColor: string;
	githubOwner: string | null;
	mainRepoPath: string;
	hideImage: boolean;
	iconUrl: string | null;
	/** Whether the project section is collapsed (workspaces hidden) */
	isCollapsed: boolean;
	/** Whether the sidebar is in collapsed mode (icon-only view) */
	isSidebarCollapsed?: boolean;
	onToggleCollapse: () => void;
	workspaceCount: number;
	onNewWorkspace: () => void;
}

export function ProjectHeader({
	projectId,
	projectName,
	projectColor,
	githubOwner,
	mainRepoPath,
	hideImage,
	iconUrl,
	isCollapsed,
	isSidebarCollapsed = false,
	onToggleCollapse,
	workspaceCount,
	onNewWorkspace,
}: ProjectHeaderProps) {
	const { t } = useTranslation();
	const electronUtils = electronTrpc.useUtils();
	const { workspaces: hostWorkspaces } = useWorkspaceCatalog();
	const { createSection, removeProjectFromSidebar } =
		useDashboardSidebarState();
	const navigate = useNavigate();
	const params = useParams({ strict: false }) as { workspaceId?: string };
	const { isCloseDialogOpen, setIsCloseDialogOpen, closeDialogCoordinator } =
		useProjectCloseDialog();
	const rename = useProjectRename(projectId, projectName);

	const openInFinder = electronTrpc.external.openInFinder.useMutation({
		onError: (error) =>
			toast.error(t("workspace.failedOpen", { message: error.message })),
	});

	const handleConfirmClose = () => {
		const shouldNavigate = hostWorkspaces.some(
			(workspace) =>
				workspace.id === params.workspaceId &&
				workspace.projectId === projectId,
		);
		const projectWorkspaces = hostWorkspaces.filter(
			(workspace) => workspace.projectId === projectId,
		);

		try {
			closeProjectImmediately({
				projectId,
				projectWorkspaces,
				shouldNavigate,
				removeProjectFromSidebar,
				closeDialog: () => setIsCloseDialogOpen(false),
				navigate: () => {
					const otherWorkspace = hostWorkspaces.find(
						(workspace) => workspace.projectId !== projectId,
					);
					if (otherWorkspace) {
						navigateToWorkspace(otherWorkspace.id, navigate);
					} else {
						navigate({ to: "/workspace" });
					}
				},
				disposeWorkspaceSessions: (workspaceId) =>
					disposeHostSessionsForWorkspace(electronUtils, workspaceId),
				onDisposeResult: toastDisposeFailures,
				onDisposeError: (error) => {
					toast.error(
						t("workspace.failedCloseProject", {
							message: error instanceof Error ? error.message : String(error),
						}),
					);
				},
			});
		} catch (error) {
			toast.error(
				t("workspace.failedCloseProject", {
					message: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	};

	const handleOpenInFinder = () => {
		openInFinder.mutate(mainRepoPath);
	};

	const handleOpenSettings = () => {
		navigate({ to: "/settings/projects/$projectId", params: { projectId } });
	};

	const updateProject = useUpdateProject({
		onError: (error) =>
			toast.error(t("workspace.failedUpdateColor", { message: error.message })),
	});

	const handleColorChange = (color: string) => {
		updateProject.mutate({ id: projectId, patch: { color } });
	};

	const handleToggleImage = () => {
		updateProject.mutate({ id: projectId, patch: { hideImage: !hideImage } });
	};

	const handleNewSection = () => {
		try {
			createSection(projectId, { name: t("workspace.newSection") });
		} catch (error) {
			toast.error(
				t("workspace.failedCreateSection", {
					message: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	};

	const colorPickerSubmenu = (
		<ContextMenuSub>
			<ContextMenuSubTrigger>
				<LuPalette className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
				{t("workspace.setColor")}
			</ContextMenuSubTrigger>
			<ContextMenuSubContent className="w-40 max-h-80 overflow-y-auto">
				<ColorSelector
					variant="menu"
					selectedColor={projectColor}
					onSelectColor={handleColorChange}
				/>
			</ContextMenuSubContent>
		</ContextMenuSub>
	);

	if (isSidebarCollapsed) {
		return (
			<>
				<ContextMenu>
					<Tooltip delayDuration={300}>
						<ContextMenuTrigger asChild>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={onToggleCollapse}
									className={cn(
										"flex items-center justify-center size-8 rounded-ds-3",
										"hover:bg-hover/50 transition-colors",
									)}
								>
									<ProjectThumbnail
										projectId={projectId}
										projectName={projectName}
										projectColor={projectColor}
										githubOwner={githubOwner}
										iconUrl={iconUrl}
										hideImage={hideImage}
									/>
								</button>
							</TooltipTrigger>
						</ContextMenuTrigger>
						<TooltipContent className="flex flex-col gap-0.5">
							<span className="font-medium">{projectName}</span>
							<span className="text-xs text-fg-mute">
								{t("workspace.projectCount", { count: workspaceCount })}
							</span>
						</TooltipContent>
					</Tooltip>
					<ContextMenuContent
						onCloseAutoFocus={closeDialogCoordinator.handleCloseAutoFocus}
					>
						<ContextMenuItem onSelect={rename.startRename}>
							<LuPencil className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							{t("workspace.renameAction")}
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={handleOpenInFinder}>
							<LuFolderOpen
								className="size-4 mr-2"
								strokeWidth={STROKE_WIDTH}
							/>
							{t("workspace.openFinder")}
						</ContextMenuItem>
						<ContextMenuItem onSelect={handleOpenSettings}>
							<LuSettings className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							{t("workspace.projectSettings")}
						</ContextMenuItem>
						{colorPickerSubmenu}
						<ContextMenuItem onSelect={handleNewSection}>
							<LuListPlus className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							{t("workspace.newSection")}
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem
							onSelect={closeDialogCoordinator.requestOpenDeleteDialog}
							className="text-destructive focus:text-destructive"
						>
							<LuX
								className="size-4 mr-2 text-destructive"
								strokeWidth={STROKE_WIDTH}
							/>
							{t("workspace.closeProject")}
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>

				<CloseProjectDialog
					projectName={projectName}
					workspaceCount={workspaceCount}
					open={isCloseDialogOpen}
					onOpenChange={setIsCloseDialogOpen}
					onConfirm={handleConfirmClose}
				/>
			</>
		);
	}

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div
						className={cn(
							"flex items-center w-full pl-3 pr-2 py-1.5 text-sm font-medium",
							"hover:bg-hover/50 transition-colors",
						)}
					>
						{rename.isRenaming ? (
							<div className="flex items-center gap-2 flex-1 min-w-0 py-0.5">
								<ProjectThumbnail
									projectId={projectId}
									projectName={projectName}
									projectColor={projectColor}
									githubOwner={githubOwner}
									hideImage={hideImage}
									iconUrl={iconUrl}
								/>
								<RenameInput
									value={rename.renameValue}
									onChange={rename.setRenameValue}
									onSubmit={rename.submitRename}
									onCancel={rename.cancelRename}
									className="h-6 px-1 py-0 text-sm -ml-1 font-medium bg-transparent border-none outline-none flex-1 min-w-0"
								/>
							</div>
						) : (
							<button
								type="button"
								onClick={onToggleCollapse}
								onDoubleClick={rename.startRename}
								className="flex items-center gap-2 flex-1 min-w-0 py-0.5 text-left cursor-pointer"
							>
								<ProjectThumbnail
									projectId={projectId}
									projectName={projectName}
									projectColor={projectColor}
									githubOwner={githubOwner}
									hideImage={hideImage}
									iconUrl={iconUrl}
								/>
								<span className="truncate">{projectName}</span>
								<span className="text-xs text-fg-mute tabular-nums font-normal">
									({workspaceCount})
								</span>
							</button>
						)}

						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onNewWorkspace();
									}}
									onContextMenu={(e) => e.stopPropagation()}
									className="p-1 rounded hover:bg-hover transition-colors shrink-0 ml-1"
								>
									<HiMiniPlus className="size-4 text-fg-mute" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" sideOffset={4}>
								{t("workspace.new")}
							</TooltipContent>
						</Tooltip>

						<button
							type="button"
							onClick={onToggleCollapse}
							onContextMenu={(e) => e.stopPropagation()}
							aria-expanded={!isCollapsed}
							className="p-1 rounded hover:bg-hover transition-colors shrink-0 ml-1"
						>
							<HiChevronRight
								className={cn(
									"size-3.5 text-fg-mute transition-transform duration-150",
									!isCollapsed && "rotate-90",
								)}
							/>
						</button>
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent
					onCloseAutoFocus={closeDialogCoordinator.handleCloseAutoFocus}
				>
					<ContextMenuItem onSelect={rename.startRename}>
						<LuPencil className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						{t("workspace.renameAction")}
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onSelect={handleOpenInFinder}>
						<LuFolderOpen className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						{t("workspace.openFinder")}
					</ContextMenuItem>
					<ContextMenuItem onSelect={handleOpenSettings}>
						<LuSettings className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						{t("workspace.projectSettings")}
					</ContextMenuItem>
					{colorPickerSubmenu}
					<ContextMenuItem onSelect={handleToggleImage}>
						{hideImage ? (
							<LuImage className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						) : (
							<LuImageOff className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						)}
						{hideImage ? t("workspace.showImage") : t("workspace.hideImage")}
					</ContextMenuItem>
					<ContextMenuItem onSelect={handleNewSection}>
						<LuListPlus className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						{t("workspace.newSection")}
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem
						onSelect={closeDialogCoordinator.requestOpenDeleteDialog}
						className="text-destructive focus:text-destructive"
					>
						<LuX
							className="size-4 mr-2 text-destructive"
							strokeWidth={STROKE_WIDTH}
						/>
						{t("workspace.closeProject")}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<CloseProjectDialog
				projectName={projectName}
				workspaceCount={workspaceCount}
				open={isCloseDialogOpen}
				onOpenChange={setIsCloseDialogOpen}
				onConfirm={handleConfirmClose}
			/>
		</>
	);
}
