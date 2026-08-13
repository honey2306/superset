import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { useMemo, useState } from "react";
import { HiCheck } from "react-icons/hi2";
import {
	LuClock3,
	LuGitBranch,
	LuSparkles,
	LuTriangleAlert,
} from "react-icons/lu";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import {
	useCatalogProjects,
	useCatalogWorkspaces,
} from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { getWorkspaceSearchKeywords } from "./workspaceSearchKeywords";

export interface TemporaryWorkspaceSelection {
	projectId: string;
	workspaceId: string;
}

interface WorkspacePickerProps {
	hostId: string | null;
	projectId: string | null;
	value: string | null;
	onChange: (workspaceId: string | null) => void;
	onSelectTemporaryWorkspace?: (
		selection: TemporaryWorkspaceSelection | null,
	) => void;
	className?: string;
}

export function WorkspacePicker({
	hostId,
	projectId,
	value,
	onChange,
	onSelectTemporaryWorkspace,
	className,
}: WorkspacePickerProps) {
	const [open, setOpen] = useState(false);
	const { t } = useTranslation();
	const { machineId } = useLocalHostService();
	const { projects: catalogProjects } = useCatalogProjects();
	const { workspaces: catalogWorkspaces } = useCatalogWorkspaces();

	const temporaryProject = catalogProjects.find(
		(project) => project.kind === "temporary",
	);
	const temporaryWorkspace = temporaryProject
		? (catalogWorkspaces.find(
				(workspace) =>
					workspace.projectId === temporaryProject.id &&
					workspace.type === "main",
			) ?? null)
		: null;
	const canSelectTemporaryWorkspace =
		!!onSelectTemporaryWorkspace && hostId === machineId;

	const { workspaces: hostWorkspaces, isReady } = useWorkspaceCatalog();
	const workspaceRows = useMemo(
		() =>
			[...hostWorkspaces].sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			),
		[hostWorkspaces],
	);

	const workspaces = useMemo(
		() =>
			projectId
				? workspaceRows.filter(
						(w) => w.projectId === projectId && w.id !== temporaryWorkspace?.id,
					)
				: [],
		[workspaceRows, projectId, temporaryWorkspace?.id],
	);

	// Resolve the pinned workspace from the full local catalog.
	const selected = value
		? (workspaceRows.find((w) => w.id === value) ?? null)
		: null;
	const offScope = !!selected && selected.projectId !== projectId;
	// A pinned value we can't resolve yet (live query still hydrating) is loading,
	// not an empty "New workspace" selection — don't flash the wrong label/warning.
	const resolving = !!value && !selected && !isReady;
	// Pinned to a workspace no host list resolves — deleted, or an unreachable
	// host with no cached snapshot. Never render this as "New workspace": that
	// hides the broken pin while dispatch keeps failing.
	const missing = !!value && !selected && isReady;
	const label = selected
		? selected.name
		: resolving
			? "Loading…"
			: missing
				? "Workspace not found"
				: "New workspace";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<PickerTrigger
					className={cn((offScope || missing) && "text-warning", className)}
					icon={
						offScope || missing ? (
							<LuTriangleAlert className="size-4 shrink-0" />
						) : selected || resolving ? (
							<LuGitBranch className="size-4 shrink-0" />
						) : (
							<LuSparkles className="size-4 shrink-0" />
						)
					}
					label={label}
				/>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="top"
				sideOffset={8}
				className="w-60 p-0"
			>
				<Command>
					<CommandInput placeholder="Search workspaces..." />
					<CommandList>
						<CommandGroup>
							<CommandItem
								value="__new__"
								onSelect={() => {
									onChange(null);
									setOpen(false);
								}}
							>
								<LuSparkles className="size-4" />
								<span>New workspace</span>
								{!selected && !resolving && !missing && (
									<HiCheck className="ml-auto size-4" />
								)}
							</CommandItem>
							{canSelectTemporaryWorkspace && (
								<CommandItem
									value="__temporary__"
									onSelect={() => {
										onSelectTemporaryWorkspace(
											temporaryProject && temporaryWorkspace
												? {
														projectId: temporaryProject.id,
														workspaceId: temporaryWorkspace.id,
													}
												: null,
										);
										setOpen(false);
									}}
								>
									<LuClock3 className="size-4" />
									<span>{t("workspace.temporaryWorkspace")}</span>
									{value === temporaryWorkspace?.id && (
										<HiCheck className="ml-auto size-4" />
									)}
								</CommandItem>
							)}
							{missing && (
								<CommandItem
									value="__deleted__"
									onSelect={() => setOpen(false)}
									className="text-warning"
								>
									<LuTriangleAlert className="size-4" />
									<span className="flex min-w-0 flex-col select-text cursor-text">
										<span className="truncate">Workspace not found</span>
										<span className="truncate text-[10px] text-warning/70">
											deleted or unavailable — pick another
										</span>
									</span>
									<HiCheck className="ml-auto size-4" />
								</CommandItem>
							)}
							{offScope && selected && (
								<CommandItem
									value={`__pinned__${selected.id}`}
									keywords={[selected.name]}
									onSelect={() => setOpen(false)}
									className="text-warning"
								>
									<LuTriangleAlert className="size-4" />
									<span className="flex min-w-0 flex-col">
										<span className="truncate">{selected.name}</span>
										<span className="truncate text-[10px] text-warning/70">
											belongs to another project
										</span>
									</span>
									<HiCheck className="ml-auto size-4" />
								</CommandItem>
							)}
							{workspaces.map((workspace) => (
								<CommandItem
									key={workspace.id}
									keywords={getWorkspaceSearchKeywords(workspace)}
									value={workspace.name}
									onSelect={() => {
										onChange(workspace.id);
										setOpen(false);
									}}
								>
									<LuGitBranch className="size-4" />
									<span className="truncate">{workspace.name}</span>
									{workspace.id === selected?.id && (
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
