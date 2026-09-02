import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import {
	LuFolderOpen,
	LuFolderPlus,
	LuFolderTree,
	LuGitBranch,
	LuLayoutTemplate,
} from "react-icons/lu";
import { UpdatesPill } from "renderer/components/UpdatesPill";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useOpenMainRepoWorkspace } from "renderer/react-query/workspaces";
import { useFolderFirstImport } from "renderer/routes/_local/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import {
	useOpenNewProjectModal,
	useOpenTemplateGalleryModal,
} from "renderer/stores/add-repository-modal";
import { SettingsButton } from "../SettingsButton";
import { CreateProjectGroupDialog } from "./CreateProjectGroupDialog";
import { STROKE_WIDTH } from "./constants";

interface WorkspaceSidebarFooterProps {
	isCollapsed?: boolean;
}

export function WorkspaceSidebarFooter({
	isCollapsed = false,
}: WorkspaceSidebarFooterProps) {
	const { t } = useTranslation();
	const openMainRepoWorkspace = useOpenMainRepoWorkspace();
	const folderImport = useFolderFirstImport({
		onError: (message) =>
			toast.error(t("workspace.openFailed"), { description: message }),
		onMultipleProjects: ({ candidates }) =>
			toast.error(t("workspace.openFailed"), {
				description: `Multiple projects use this repository (${candidates.length}). Open the project you want from settings to set it up on this device.`,
			}),
	});
	const openNewProject = useOpenNewProjectModal();
	const openTemplateGallery = useOpenTemplateGalleryModal();
	const [isCreateProjectGroupOpen, setIsCreateProjectGroupOpen] =
		useState(false);

	const handleOpenProject = async () => {
		const result = await folderImport.start();
		if (result) toast.success(t("project.created"));
	};

	const openMainWorkspaceForProject = async (projectId: string) => {
		try {
			await openMainRepoWorkspace.mutateAsync({ projectId });
		} catch (err) {
			toast.error(t("workspace.openFailed"), {
				description:
					err instanceof Error ? err.message : t("workspace.createFailed"),
			});
		}
	};

	const handleCloneProject = async () => {
		const result = await openNewProject();
		if (result) await openMainWorkspaceForProject(result.projectId);
	};

	const handleTemplateProject = async () => {
		const result = await openTemplateGallery();
		if (result) await openMainWorkspaceForProject(result.projectId);
	};

	const isLoading = folderImport.isPending || openMainRepoWorkspace.isPending;

	if (isCollapsed) {
		return (
			<div className="border-t border-line p-2 flex flex-col items-center gap-1">
				<UpdatesPill isCollapsed />
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 text-fg-mute hover:text-fg"
							onClick={() => setIsCreateProjectGroupOpen(true)}
						>
							<LuFolderTree className="size-4" strokeWidth={STROKE_WIDTH} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right">
						{t("workspace.createProjectGroup")}
					</TooltipContent>
				</Tooltip>
				<DropdownMenu>
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-8 text-fg-mute hover:text-fg"
									disabled={isLoading}
								>
									<LuFolderPlus className="size-4" strokeWidth={STROKE_WIDTH} />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent side="right">
							{t("workspace.addRepository")}
						</TooltipContent>
					</Tooltip>
					<DropdownMenuContent side="top" align="start">
						<DropdownMenuItem onClick={handleOpenProject} disabled={isLoading}>
							<LuFolderOpen className="size-4" strokeWidth={STROKE_WIDTH} />
							{t("workspace.openProject")}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={handleCloneProject}>
							<LuGitBranch className="size-4" strokeWidth={STROKE_WIDTH} />
							{t("workspace.cloneFromUrl")}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={handleTemplateProject}>
							<LuLayoutTemplate className="size-4" strokeWidth={STROKE_WIDTH} />
							{t("workspace.startFromTemplate")}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<SettingsButton />
				<CreateProjectGroupDialog
					open={isCreateProjectGroupOpen}
					onOpenChange={setIsCreateProjectGroupOpen}
				/>
			</div>
		);
	}

	return (
		<div className="border-t border-line p-2 flex items-center gap-2">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="flex-1 min-w-0 justify-start gap-2 text-fg-mute hover:text-fg"
						disabled={isLoading}
					>
						<LuFolderPlus className="w-4 h-4" strokeWidth={STROKE_WIDTH} />
						<span className="truncate">{t("workspace.addRepository")}</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent side="top" align="start">
					<DropdownMenuItem onClick={handleOpenProject} disabled={isLoading}>
						<LuFolderOpen className="size-4" strokeWidth={STROKE_WIDTH} />
						{t("workspace.openProject")}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleCloneProject}>
						<LuGitBranch className="size-4" strokeWidth={STROKE_WIDTH} />
						{t("workspace.cloneFromUrl")}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleTemplateProject}>
						<LuLayoutTemplate className="size-4" strokeWidth={STROKE_WIDTH} />
						{t("workspace.startFromTemplate")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="size-8 shrink-0 text-fg-mute hover:text-fg"
						onClick={() => setIsCreateProjectGroupOpen(true)}
					>
						<LuFolderTree className="size-4" strokeWidth={STROKE_WIDTH} />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">
					{t("workspace.createProjectGroup")}
				</TooltipContent>
			</Tooltip>
			<UpdatesPill />
			<SettingsButton />
			<CreateProjectGroupDialog
				open={isCreateProjectGroupOpen}
				onOpenChange={setIsCreateProjectGroupOpen}
			/>
		</div>
	);
}
