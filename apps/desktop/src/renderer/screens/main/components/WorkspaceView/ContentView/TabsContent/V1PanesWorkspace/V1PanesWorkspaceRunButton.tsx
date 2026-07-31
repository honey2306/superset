import type { WorkspaceStore } from "@superset/panes";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import {
	HiChevronDown,
	HiMiniCog6Tooth,
	HiMiniPlay,
	HiMiniStop,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { buildTerminalCommand } from "renderer/lib/terminal/launch-command";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useHostServiceTerminal } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useHostServiceTerminal";
import { useSetSettingsSearchQuery } from "renderer/stores/settings-state";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { V1PanesPaneData } from "./types";

const CTRL_C_INPUT = "\u0003";

export function V1PanesWorkspaceRunButton({
	workspaceId,
	worktreePath,
	store,
}: {
	workspaceId: string;
	worktreePath?: string;
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>;
}) {
	const navigate = useNavigate();
	const setSettingsSearchQuery = useSetSettingsSearchQuery();
	const tabs = useStore(store, (state) => state.tabs);
	const { hostUrl, hostWorkspaceId } = useHostServiceTerminal({
		workspaceId,
		worktreePath,
		forceEnabled: true,
	});
	const { data: runDefinition } =
		electronTrpc.workspaces.getWorkspaceRunDefinition.useQuery(
			{ workspaceId },
			{ enabled: !!workspaceId },
		);
	const hasRunCommand = (runDefinition?.commands ?? []).some(
		(command) => command.trim().length > 0,
	);
	const runPane = tabs
		.flatMap((tab) => Object.values(tab.panes))
		.find(
			(pane) =>
				pane.data.workspaceRun?.workspaceId === workspaceId &&
				pane.data.workspaceRun.state === "running",
		);
	const isRunning = !!runPane;

	const handleRun = async () => {
		if (runPane?.data.terminalId && hostUrl && hostWorkspaceId) {
			try {
				await getHostServiceClientByUrl(hostUrl).terminal.writeInput.mutate({
					terminalId: runPane.data.terminalId,
					workspaceId: hostWorkspaceId,
					data: CTRL_C_INPUT,
				});
				store.getState().setPaneData({
					paneId: runPane.id,
					data: {
						...runPane.data,
						workspaceRun: {
							workspaceId,
							...runPane.data.workspaceRun,
							state: "stopped-by-user",
						},
					},
				});
			} catch (error) {
				toast.error("Failed to stop workspace run command", {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			}
			return;
		}

		if (!hasRunCommand) {
			handleConfigure();
			return;
		}

		const definition =
			await electronTrpcClient.workspaces.getWorkspaceRunDefinition.query({
				workspaceId,
			});
		const command = buildTerminalCommand(definition?.commands);
		if (!command) {
			toast.error("No workspace run command configured");
			return;
		}
		const terminalId = crypto.randomUUID();
		store.getState().addTab({
			titleOverride: "Workspace Run",
			panes: [
				{
					kind: "terminal",
					titleOverride: "Workspace Run",
					data: {
						terminalId,
						initialCommand: command,
						initialCwd: definition?.cwd ?? worktreePath,
						workspaceRun: { workspaceId, state: "running", command },
					},
				},
			],
		});
	};

	const handleConfigure = useCallback(() => {
		if (runDefinition?.source === "terminal-preset") {
			void navigate({
				to: "/settings/terminal",
				search: { editPresetId: runDefinition.presetId },
			});
			return;
		}
		setSettingsSearchQuery("scripts");
		void navigate({ to: "/settings" });
	}, [navigate, runDefinition, setSettingsSearchQuery]);

	return (
		<div className="flex items-center">
			<button
				type="button"
				onClick={() => void handleRun()}
				aria-label={isRunning ? "Stop workspace run" : "Run workspace"}
				className={cn(
					"flex items-center gap-1.5 h-6 px-1.5 sm:px-2 rounded-l border border-r-0 border-border/60 bg-secondary/50 text-xs font-medium",
					"transition-all duration-150 ease-out",
					"hover:bg-secondary hover:border-border",
					"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
					"active:scale-[0.98]",
					isRunning
						? "text-emerald-300 border-emerald-500/25 bg-emerald-500/10"
						: hasRunCommand
							? "text-foreground"
							: "text-muted-foreground/80 border-border/40 bg-secondary/40",
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
						className={cn(
							"flex items-center justify-center h-6 w-6 rounded-l-none rounded-r border border-border/60 bg-secondary/50 text-muted-foreground",
							"transition-all duration-150 ease-out",
							"hover:bg-secondary hover:border-border hover:text-foreground",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							"active:scale-[0.98]",
							isRunning &&
								"text-emerald-300 border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/20",
						)}
					>
						<HiChevronDown className="size-3.5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuItem onClick={handleConfigure}>
						<HiMiniCog6Tooth className="mr-2 size-4" />
						{runDefinition?.source === "terminal-preset"
							? "Edit run preset"
							: "Configure"}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
