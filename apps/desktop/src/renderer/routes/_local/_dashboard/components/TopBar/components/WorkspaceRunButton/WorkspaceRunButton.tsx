import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { memo, useCallback } from "react";
import {
	HiChevronDown,
	HiMiniCog6Tooth,
	HiMiniCommandLine,
	HiMiniPlay,
	HiMiniStop,
	HiMiniXMark,
} from "react-icons/hi2";
import { useWorkspaceRunDefinition } from "renderer/hooks/host-service/useWorkspaceRunDefinition";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useWorkspaceRunCommand } from "renderer/routes/_local/_dashboard/workspace/$workspaceId/hooks/useWorkspaceRunCommand";
import { waitForHostTerminalBackend } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/host-terminal-backend";
import { useSetSettingsSearchQuery } from "renderer/stores/settings-state";
import { useTabsStore } from "renderer/stores/tabs/store";

interface WorkspaceRunButtonProps {
	projectId?: string | null;
	workspaceId: string;
	worktreePath?: string | null;
}

export const WorkspaceRunButton = memo(function WorkspaceRunButton({
	projectId,
	workspaceId,
	worktreePath,
}: WorkspaceRunButtonProps) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const setSettingsSearchQuery = useSetSettingsSearchQuery();
	const hotkeyText = useHotkeyDisplay("RUN_WORKSPACE_COMMAND").text;
	const addTab = useTabsStore((state) => state.addTab);
	const removePane = useTabsStore((state) => state.removePane);
	const setPaneName = useTabsStore((state) => state.setPaneName);
	const setPaneStatus = useTabsStore((state) => state.setPaneStatus);
	const setPaneLifecycleScript = useTabsStore(
		(state) => state.setPaneLifecycleScript,
	);
	const {
		canForceStop,
		forceStopWorkspaceRun,
		isRunning,
		isPending,
		toggleWorkspaceRun,
	} = useWorkspaceRunCommand({
		workspaceId,
		worktreePath,
	});
	const { data: runDefinition } = useWorkspaceRunDefinition(workspaceId);
	const hasRunCommand = (runDefinition?.commands ?? []).some(
		(command) => command.trim().length > 0,
	);

	const handleRunClick = useCallback(() => {
		if (!hasRunCommand && projectId) {
			setSettingsSearchQuery("scripts");
			void navigate({
				to: "/settings/projects/$projectId",
				params: { projectId },
			});
			return;
		}

		void toggleWorkspaceRun();
	}, [
		hasRunCommand,
		navigate,
		projectId,
		setSettingsSearchQuery,
		toggleWorkspaceRun,
	]);

	const handleConfigureClick = useCallback(() => {
		if (!projectId) return;
		setSettingsSearchQuery("scripts");
		void navigate({
			to: "/settings/projects/$projectId",
			params: { projectId },
		});
	}, [navigate, projectId, setSettingsSearchQuery]);

	const handleForceStopClick = useCallback(() => {
		void forceStopWorkspaceRun();
	}, [forceStopWorkspaceRun]);

	const launchLifecycleScript = useCallback(
		async (kind: "setup" | "teardown") => {
			const { paneId } = addTab(workspaceId);
			const label = kind === "setup" ? "Workspace Setup" : "Workspace Teardown";
			setPaneName(paneId, label);
			setPaneLifecycleScript(paneId, { kind, state: "running" });
			try {
				const backend = await waitForHostTerminalBackend(workspaceId);
				const result = await getHostServiceClientByUrl(
					backend.hostUrl,
				).config.launchLifecycleScript.mutate({
					workspaceId: backend.hostWorkspaceId,
					terminalId: paneId,
					kind,
				});
				if (result.status === "not-configured") {
					removePane(paneId);
					toast.error(`No ${kind} script configured`);
				}
			} catch (error) {
				setPaneLifecycleScript(paneId, { kind, state: "failed" });
				setPaneStatus(paneId, "failed");
				toast.error(`Failed to run ${kind} script`, {
					description: error instanceof Error ? error.message : String(error),
				});
			}
		},
		[
			addTab,
			removePane,
			setPaneLifecycleScript,
			setPaneName,
			setPaneStatus,
			workspaceId,
		],
	);

	const buttonLabel = isRunning
		? t("dashboard.stopRun")
		: hasRunCommand
			? t("dashboard.run")
			: t("dashboard.setRun");
	const buttonAriaLabel = isRunning
		? t("dashboard.stopRunAria")
		: hasRunCommand
			? t("dashboard.runAria")
			: t("dashboard.configureRunAria");

	return (
		<div className="flex items-center no-drag">
			{/* Main button - Run/Stop action */}
			<button
				type="button"
				onClick={handleRunClick}
				disabled={isPending}
				aria-label={buttonAriaLabel}
				className={cn(
					"group flex items-center gap-1.5 h-6 px-1.5 sm:px-2 rounded-l border border-r-0 border-line/60 bg-secondary/50 text-xs font-medium",
					"transition-all duration-150 ease-out",
					"hover:bg-secondary hover:border-line",
					"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
					"active:scale-[0.98]",
					isPending && "opacity-50 pointer-events-none",
					isRunning
						? "text-success border-success/25 bg-success-tint/10"
						: hasRunCommand
							? "text-fg"
							: "text-fg-mute/80 border-line/40 bg-secondary/40",
				)}
			>
				{isRunning ? (
					<HiMiniStop className="size-3.5 shrink-0" />
				) : hasRunCommand ? (
					<HiMiniPlay className="size-3.5 shrink-0" />
				) : (
					<HiMiniCog6Tooth className="size-3.5 shrink-0" />
				)}
				<span className="hidden sm:inline">{buttonLabel}</span>
				{hotkeyText && hotkeyText !== "Unassigned" && (
					<span className="hidden sm:inline text-[10px] text-fg-faint ml-1">
						{hotkeyText}
					</span>
				)}
			</button>

			{/* Dropdown trigger */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={isPending}
						aria-label={t("dashboard.runMenuAria")}
						className={cn(
							"flex items-center justify-center h-6 w-6 rounded-r border border-line/60 bg-secondary/50 text-fg-mute",
							"transition-all duration-150 ease-out",
							"hover:bg-secondary hover:border-line hover:text-fg",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							"active:scale-[0.98]",
							isPending && "opacity-50 pointer-events-none",
							isRunning
								? "text-success border-success/25 bg-success-tint/10 hover:bg-success-tint/20"
								: !hasRunCommand &&
										"text-fg-mute/80 border-line/40 bg-secondary/40",
						)}
					>
						<HiChevronDown className="size-3.5" />
					</button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" className="w-40">
					{canForceStop && (
						<>
							<DropdownMenuItem
								onClick={handleForceStopClick}
								className="text-destructive focus:text-destructive"
							>
								<HiMiniXMark className="mr-2 size-4 text-destructive" />
								{t("dashboard.forceStop")}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}
					<DropdownMenuItem onClick={() => void launchLifecycleScript("setup")}>
						<HiMiniCommandLine className="mr-2 size-4" />
						Run setup
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => void launchLifecycleScript("teardown")}
					>
						<HiMiniCommandLine className="mr-2 size-4" />
						Run teardown
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={handleConfigureClick}>
						<HiMiniCog6Tooth className="mr-2 size-4" />
						{t("dashboard.configure")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
});
