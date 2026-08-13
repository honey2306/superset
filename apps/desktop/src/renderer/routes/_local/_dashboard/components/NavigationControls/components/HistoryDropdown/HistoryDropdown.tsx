import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { LuCpu, LuGitBranch, LuHistory } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { useLocalAutomations } from "renderer/routes/_local/_dashboard/hooks/useLocalAutomationData";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import {
	type RecentlyViewedEntry,
	useRecentlyViewed,
} from "./hooks/useRecentlyViewed";

function WorkspaceRow({
	entry,
	isCurrent,
	workspaceData,
	onSelect,
}: {
	entry: RecentlyViewedEntry;
	isCurrent: boolean;
	workspaceData: {
		id: string;
		projectName: string;
		branch: string;
	}[];
	onSelect: () => void;
}) {
	const ws = workspaceData.find((w) => w.id === entry.entityId);

	return (
		<DropdownMenuItem
			className={cn("gap-2.5", isCurrent && "bg-accent-tint")}
			onSelect={onSelect}
		>
			<span className="text-fg-mute text-xs shrink-0 w-20 text-left line-clamp-1">
				{ws ? ws.projectName : "Workspace"}
			</span>
			<span className="flex items-center justify-center w-4 shrink-0">
				<LuGitBranch className="size-3 text-fg-mute" strokeWidth={1.5} />
			</span>
			<span
				className={cn(
					"truncate text-xs font-normal flex-1 min-w-0",
					!ws && "text-fg-mute",
				)}
			>
				{ws ? ws.branch : "Unknown"}
			</span>
		</DropdownMenuItem>
	);
}

function AutomationRow({
	entry,
	isCurrent,
	automationData,
	onSelect,
}: {
	entry: RecentlyViewedEntry;
	isCurrent: boolean;
	automationData: {
		id: string;
		name: string;
		agentId: string;
	}[];
	onSelect: () => void;
}) {
	const automation = automationData.find((a) => a.id === entry.entityId);
	const presetIcon = usePresetIcon(automation?.agentId ?? "");

	return (
		<DropdownMenuItem
			className={cn("gap-2.5", isCurrent && "bg-accent-tint")}
			onSelect={onSelect}
		>
			<span className="text-fg-mute text-xs shrink-0 w-20 text-left line-clamp-1">
				Automation
			</span>
			<span className="flex items-center justify-center w-4 shrink-0">
				{presetIcon ? (
					<img src={presetIcon} alt="" className="size-3.5 object-contain" />
				) : (
					<LuCpu className="size-3 text-fg-mute" strokeWidth={1.5} />
				)}
			</span>
			<span
				className={cn(
					"truncate text-xs font-normal flex-1 min-w-0",
					!automation && "text-fg-mute",
				)}
			>
				{automation ? automation.name : "Unknown"}
			</span>
		</DropdownMenuItem>
	);
}

export function HistoryDropdown() {
	const navigate = useNavigate();
	const recentEntries = useRecentlyViewed(20);
	const currentPath = useLocation({ select: (loc) => loc.pathname });
	const { projects, workspaces } = useWorkspaceCatalog();
	const workspaceData = useMemo(() => {
		const projectNamesById = new Map(
			projects.map((project) => [project.id, project.name]),
		);
		return workspaces.flatMap((workspace) => {
			const projectName = projectNamesById.get(workspace.projectId);
			if (projectName === undefined) return [];
			return [{ id: workspace.id, projectName, branch: workspace.branch }];
		});
	}, [projects, workspaces]);

	const { data: localAutomations = [] } = useLocalAutomations();
	const automationData = useMemo(
		() =>
			localAutomations.map((automation) => ({
				id: automation.id,
				name: automation.name,
				agentId: automation.agent,
			})),
		[localAutomations],
	);

	const filteredEntries = recentEntries.filter((entry) => {
		if (entry.type === "workspace") {
			return workspaceData.some((workspace) => workspace.id === entry.entityId);
		}
		if (entry.type === "automation") {
			return automationData.some(
				(automation) => automation.id === entry.entityId,
			);
		}
		return false;
	});

	if (filteredEntries.length === 0) {
		return (
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						disabled
						className="no-drag flex items-center justify-center size-7 rounded-ds-3 text-fg-mute opacity-30"
					>
						<LuHistory className="size-3.5" strokeWidth={1.5} />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">Recently viewed</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<DropdownMenu>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="no-drag flex items-center justify-center size-7 rounded-ds-3 text-fg-mute hover:text-fg hover:bg-hover transition-colors"
						>
							<LuHistory className="size-3.5" strokeWidth={1.5} />
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">Recently viewed</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="start" className="w-80">
				<DropdownMenuLabel>Recently Viewed</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{filteredEntries.map((entry) => {
					if (entry.type === "workspace") {
						return (
							<WorkspaceRow
								key={entry.path}
								entry={entry}
								isCurrent={entry.path === currentPath}
								workspaceData={workspaceData}
								onSelect={() => navigate({ to: entry.path })}
							/>
						);
					}
					return (
						<AutomationRow
							key={entry.path}
							entry={entry}
							isCurrent={entry.path === currentPath}
							automationData={automationData}
							onSelect={() => navigate({ to: entry.path })}
						/>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
