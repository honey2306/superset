import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { HiCheck } from "react-icons/hi2";
import { LuClock3, LuFolder } from "react-icons/lu";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ProjectOption } from "renderer/routes/_local/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { ProjectThumbnail } from "renderer/routes/_local/components/ProjectThumbnail";

interface TemporaryTargetOption {
	isSelected: boolean;
	onSelect: () => void;
}

interface ProjectPickerProps {
	selectedProject: ProjectOption | undefined;
	recentProjects: ProjectOption[];
	onSelectProject: (projectId: string) => void;
	temporaryTarget?: TemporaryTargetOption;
	className?: string;
}

export function ProjectPicker({
	selectedProject,
	recentProjects,
	onSelectProject,
	temporaryTarget,
	className,
}: ProjectPickerProps) {
	const [open, setOpen] = useState(false);
	const { t } = useTranslation();

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<PickerTrigger
					className={className}
					icon={
						temporaryTarget?.isSelected ? (
							<LuClock3 className="size-5 shrink-0" />
						) : selectedProject ? (
							<ProjectThumbnail
								projectName={selectedProject.name}
								iconUrl={selectedProject.iconUrl}
								className="!size-5"
							/>
						) : (
							<LuFolder className="size-5 shrink-0" />
						)
					}
					label={
						temporaryTarget?.isSelected
							? t("workspace.temporaryWorkspace")
							: (selectedProject?.name ?? "Select project")
					}
				/>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 p-0">
				<Command>
					<CommandInput placeholder="Search projects..." />
					<CommandList>
						<CommandEmpty>No projects found.</CommandEmpty>
						<CommandGroup>
							{temporaryTarget && (
								<CommandItem
									value="__temporary_workspace__"
									onSelect={() => {
										temporaryTarget.onSelect();
										setOpen(false);
									}}
								>
									<LuClock3 className="size-4" />
									{t("workspace.temporaryWorkspace")}
									{temporaryTarget.isSelected && (
										<HiCheck className="ml-auto size-4" />
									)}
								</CommandItem>
							)}
							{recentProjects.map((project) => (
								<CommandItem
									key={project.id}
									value={project.name}
									onSelect={() => {
										onSelectProject(project.id);
										setOpen(false);
									}}
								>
									<ProjectThumbnail
										projectName={project.name}
										iconUrl={project.iconUrl}
									/>
									{project.name}
									{project.id === selectedProject?.id && (
										<HiCheck className="ml-auto size-4" />
									)}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
