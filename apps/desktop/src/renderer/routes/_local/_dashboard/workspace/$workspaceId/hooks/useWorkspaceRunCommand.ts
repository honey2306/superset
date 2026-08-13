import { toast } from "@superset/ui/sonner";
import { useCallback, useRef, useState } from "react";
import { useWorkspaceRunDefinition } from "renderer/hooks/host-service/useWorkspaceRunDefinition";
import { useHostTerminalLauncher } from "renderer/lib/terminal/host-terminal-launcher";
import { buildTerminalCommand } from "renderer/lib/terminal/launch-command";
import { useTabsStore } from "renderer/stores/tabs/store";

interface UseWorkspaceRunCommandOptions {
	workspaceId: string;
	worktreePath?: string | null;
}

const CTRL_C_INPUT = "\u0003";

function setPaneWorkspaceRunState(
	paneId: string,
	state: "running" | "stopped-by-user" | "stopped-by-exit",
): void {
	const workspaceRun = useTabsStore.getState().panes[paneId]?.workspaceRun;
	if (!workspaceRun) return;
	useTabsStore.getState().setPaneWorkspaceRun(paneId, {
		...workspaceRun,
		state,
	});
}

export function useWorkspaceRunCommand({
	workspaceId,
	worktreePath,
}: UseWorkspaceRunCommandOptions) {
	const isStartingRef = useRef(false);
	const [isPending, setIsPending] = useState(false);
	const { refetch: refetchRunDefinition } =
		useWorkspaceRunDefinition(workspaceId);
	const terminalLauncher = useHostTerminalLauncher();

	const addTab = useTabsStore((s) => s.addTab);
	const setPaneName = useTabsStore((s) => s.setPaneName);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const setPaneWorkspaceRun = useTabsStore((s) => s.setPaneWorkspaceRun);

	// Derive run state from pane metadata (single source of truth)
	const runPane = useTabsStore((s) => {
		const panes = Object.values(s.panes).filter(
			(p) =>
				p.type === "terminal" && p.workspaceRun?.workspaceId === workspaceId,
		);
		return (
			panes.find((pane) => pane.workspaceRun?.state === "running") ??
			panes[0] ??
			null
		);
	});

	const isRunning = runPane?.workspaceRun?.state === "running";
	const canForceStop = isRunning && Boolean(runPane);

	const launchWorkspaceRunInPane = useCallback(
		async ({
			paneId,
			command,
			cwd,
		}: {
			paneId: string;
			tabId: string;
			command: string;
			cwd?: string;
		}) => {
			await terminalLauncher.launchCommand({
				terminalId: paneId,
				workspaceId,
				command,
				cwd,
			});
		},
		[terminalLauncher, workspaceId],
	);

	const toggleWorkspaceRun = useCallback(async () => {
		if (isStartingRef.current) return;

		// STOP: send Ctrl+C through the PTY so the run command stops the same
		// way it would if the user interrupted it from the keyboard.
		if (isRunning && runPane) {
			setIsPending(true);
			try {
				await terminalLauncher.write({
					terminalId: runPane.id,
					workspaceId,
					data: CTRL_C_INPUT,
				});
				setPaneWorkspaceRunState(runPane.id, "stopped-by-user");
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				if (message.includes("not found") || message.includes("not alive")) {
					setPaneWorkspaceRunState(runPane.id, "stopped-by-exit");
					return;
				}
				toast.error("Failed to stop workspace run command", {
					description: message,
				});
			} finally {
				setIsPending(false);
			}
			return;
		}

		isStartingRef.current = true;
		setIsPending(true);
		try {
			// START: always fetch the latest config so run-script detection never
			// depends on stale cache state or on a query still loading in the view.
			const { data: runDefinition } = await refetchRunDefinition();
			const command = buildTerminalCommand(runDefinition?.commands);
			if (!command) {
				toast.error("No workspace run command configured", {
					description:
						"Add a run script in Project Settings or mark a preset as the workspace run.",
				});
				return;
			}

			const fallbackCwd = worktreePath?.trim() ? worktreePath : undefined;
			const initialCwd = runDefinition?.cwd ?? fallbackCwd;

			// Re-read from the store: runPane was captured before the await
			// above and the pane/tab may have been closed in the meantime.
			const tabsState = useTabsStore.getState();
			const livePane = runPane ? tabsState.panes[runPane.id] : undefined;
			const liveTab = livePane
				? tabsState.tabs.find((t) => t.id === livePane.tabId)
				: undefined;
			if (livePane && liveTab) {
				setActiveTab(workspaceId, liveTab.id);
				setFocusedPane(liveTab.id, livePane.id);
				setPaneName(livePane.id, "Workspace Run");
				setPaneWorkspaceRun(livePane.id, {
					workspaceId,
					state: "running",
					command,
				});
				try {
					await launchWorkspaceRunInPane({
						paneId: livePane.id,
						tabId: livePane.tabId,
						command,
						cwd: initialCwd,
					});
				} catch (error) {
					setPaneWorkspaceRunState(livePane.id, "stopped-by-exit");
					toast.error("Failed to run workspace command", {
						description:
							error instanceof Error ? error.message : "Unknown error",
					});
				}
				return;
			}

			const result = addTab(workspaceId, { initialCwd });
			const { tabId, paneId } = result;

			setPaneName(paneId, "Workspace Run");
			setPaneWorkspaceRun(paneId, {
				workspaceId,
				state: "running",
				command,
			});
			setActiveTab(workspaceId, tabId);
			setFocusedPane(tabId, paneId);
			try {
				await launchWorkspaceRunInPane({
					paneId,
					tabId,
					command,
					cwd: initialCwd,
				});
			} catch (error) {
				setPaneWorkspaceRunState(paneId, "stopped-by-exit");
				toast.error("Failed to run workspace command", {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			}
		} catch (error) {
			toast.error("Failed to resolve workspace run command", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			isStartingRef.current = false;
			setIsPending(false);
		}
	}, [
		addTab,
		isRunning,
		launchWorkspaceRunInPane,
		runPane,
		setActiveTab,
		setFocusedPane,
		setPaneName,
		setPaneWorkspaceRun,
		workspaceId,
		worktreePath,
		terminalLauncher,
		refetchRunDefinition,
	]);

	const forceStopWorkspaceRun = useCallback(async () => {
		if (!runPane || !isRunning || isStartingRef.current) return;

		setIsPending(true);
		try {
			await terminalLauncher.kill({
				terminalId: runPane.id,
				workspaceId,
			});
			setPaneWorkspaceRunState(runPane.id, "stopped-by-user");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			if (message.includes("not found") || message.includes("not alive")) {
				setPaneWorkspaceRunState(runPane.id, "stopped-by-exit");
				return;
			}
			toast.error("Failed to force stop workspace run command", {
				description: message,
			});
		} finally {
			setIsPending(false);
		}
	}, [isRunning, runPane, terminalLauncher, workspaceId]);

	return {
		canForceStop,
		forceStopWorkspaceRun,
		isRunning,
		isPending,
		toggleWorkspaceRun,
	};
}
