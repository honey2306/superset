import type { WorkspaceStore } from "@superset/panes";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import {
	HiChevronDown,
	HiMiniCog6Tooth,
	HiMiniPlay,
	HiMiniStop,
} from "react-icons/hi2";
import { useWorkspaceRunDefinition } from "renderer/hooks/host-service/useWorkspaceRunDefinition";
import { useWorkspaceRunCommand } from "renderer/routes/_local/_dashboard/workspace/$workspaceId/hooks/useWorkspaceRunCommand";
import { useSetSettingsSearchQuery } from "renderer/stores/settings-state";
import type { StoreApi } from "zustand/vanilla";
import type { PanesPaneData } from "./types";

export function PanesWorkspaceRunButton({
	workspaceId,
	worktreePath,
}: {
	workspaceId: string;
	worktreePath?: string;
	store: StoreApi<WorkspaceStore<PanesPaneData>>;
}) {
	const navigate = useNavigate();
	const setSettingsSearchQuery = useSetSettingsSearchQuery();
	const { data: runDefinition } = useWorkspaceRunDefinition(workspaceId);
	const { isRunning, isPending, toggleWorkspaceRun } = useWorkspaceRunCommand({
		workspaceId,
		worktreePath,
	});
	const hasRunCommand = (runDefinition?.commands ?? []).some(
		(command) => command.trim().length > 0,
	);
	const handleConfigure = useCallback(() => {
		setSettingsSearchQuery("scripts");
		void navigate({ to: "/settings" });
	}, [navigate, setSettingsSearchQuery]);
	const handleRun = useCallback(() => {
		if (!hasRunCommand && !isRunning) {
			handleConfigure();
			return;
		}
		void toggleWorkspaceRun();
	}, [handleConfigure, hasRunCommand, isRunning, toggleWorkspaceRun]);

	return (
		<div className="flex items-center">
			<button
				type="button"
				onClick={handleRun}
				disabled={isPending}
				aria-label={isRunning ? "Stop workspace run" : "Run workspace"}
				className={cn(
					"flex items-center gap-1.5 h-6 px-1.5 sm:px-2 rounded-l border border-r-0 border-line/60 bg-secondary/50 text-xs font-medium",
					"transition-all duration-150 ease-out hover:bg-secondary hover:border-line focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-[0.98]",
					isPending && "opacity-50 pointer-events-none",
					isRunning
						? "text-success border-success/25 bg-success-tint"
						: hasRunCommand
							? "text-fg"
							: "text-fg-mute/80 border-line/40 bg-secondary/40",
				)}
			>
				{isRunning ? (
					<HiMiniStop className="size-3.5 shrink-0" />
				) : (
					<HiMiniPlay className="size-3.5 shrink-0" />
				)}
				<span className="hidden sm:inline">
					{isRunning ? "Stop" : hasRunCommand ? "Run" : "Set Run"}
				</span>
			</button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Run options"
						className="h-6 w-6 rounded-l-none rounded-r border border-line/60 bg-secondary/50"
					>
						<HiChevronDown className="size-3.5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuItem onClick={handleConfigure}>
						<HiMiniCog6Tooth className="mr-2 size-4" />
						Configure
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
