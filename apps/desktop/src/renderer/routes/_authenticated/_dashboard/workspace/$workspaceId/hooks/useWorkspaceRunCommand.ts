import { FEATURE_FLAGS } from "@superset/shared/constants";
import { toast } from "@superset/ui/sonner";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useRef, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	buildTerminalCommand,
	launchCommandInPane,
} from "renderer/lib/terminal/launch-command";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { waitForV1HostTerminalBackend } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/v1-host-terminal-backend";
import { useTabsStore } from "renderer/stores/tabs/store";
import {
	clearPaneWorkspaceRunLaunchPending,
	createWorkspaceRun,
	markPaneWorkspaceRunLaunchPending,
	setPaneWorkspaceRunState,
} from "renderer/stores/tabs/workspace-run";

interface UseWorkspaceRunCommandOptions {
	workspaceId: string;
	worktreePath?: string | null;
}

const CTRL_C_INPUT = "\u0003";

export function useWorkspaceRunCommand({
	workspaceId,
	worktreePath,
}: UseWorkspaceRunCommandOptions) {
	const isStartingRef = useRef(false);
	const [isPending, setIsPending] = useState(false);
	const hostTerminalEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.V1_HOST_SERVICE_TERMINAL) ?? false;

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
			tabId,
			command,
			cwd,
		}: {
			paneId: string;
			tabId: string;
			command: string;
			cwd?: string;
		}) => {
			markPaneWorkspaceRunLaunchPending(paneId);
			try {
				if (hostTerminalEnabled) {
					const backend = await waitForV1HostTerminalBackend(workspaceId);
					await getHostServiceClientByUrl(
						backend.hostUrl,
					).terminal.createSession.mutate({
						terminalId: paneId,
						workspaceId: backend.hostWorkspaceId,
						initialCommand: command,
						cwd,
					});
					return;
				}
				await launchCommandInPane({
					paneId,
					tabId,
					workspaceId,
					command,
					cwd,
					createOrAttach: (input) =>
						electronTrpcClient.terminal.createOrAttach.mutate({
							...input,
							allowKilled: true,
						}),
					write: (input) => electronTrpcClient.terminal.write.mutate(input),
				});
			} finally {
				clearPaneWorkspaceRunLaunchPending(paneId);
			}
		},
		[hostTerminalEnabled, workspaceId],
	);

	const toggleWorkspaceRun = useCallback(async () => {
		if (isStartingRef.current) return;

		// STOP: send Ctrl+C through the PTY so the run command stops the same
		// way it would if the user interrupted it from the keyboard.
		if (isRunning && runPane) {
			setIsPending(true);
			try {
				if (hostTerminalEnabled) {
					const backend = await waitForV1HostTerminalBackend(workspaceId);
					await getHostServiceClientByUrl(
						backend.hostUrl,
					).terminal.writeInput.mutate({
						terminalId: runPane.id,
						workspaceId: backend.hostWorkspaceId,
						data: CTRL_C_INPUT,
					});
					setPaneWorkspaceRunState(runPane.id, "stopped-by-user");
					return;
				}
				await electronTrpcClient.terminal.write.mutate({
					paneId: runPane.id,
					data: CTRL_C_INPUT,
					throwOnError: true,
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
			const runDefinition =
				await electronTrpcClient.workspaces.getWorkspaceRunDefinition.query({
					workspaceId,
				});
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
				setPaneWorkspaceRun(
					livePane.id,
					createWorkspaceRun({
						workspaceId,
						state: "running",
						command,
					}),
				);
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
			setPaneWorkspaceRun(
				paneId,
				createWorkspaceRun({
					workspaceId,
					state: "running",
					command,
				}),
			);
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
		hostTerminalEnabled,
	]);

	const forceStopWorkspaceRun = useCallback(async () => {
		if (!runPane || !isRunning || isStartingRef.current) return;

		setIsPending(true);
		try {
			if (hostTerminalEnabled) {
				const backend = await waitForV1HostTerminalBackend(workspaceId);
				await getHostServiceClientByUrl(
					backend.hostUrl,
				).terminal.killSession.mutate({
					terminalId: runPane.id,
					workspaceId: backend.hostWorkspaceId,
				});
				setPaneWorkspaceRunState(runPane.id, "stopped-by-user");
				return;
			}
			await electronTrpcClient.terminal.kill.mutate({
				paneId: runPane.id,
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
	}, [hostTerminalEnabled, isRunning, runPane, workspaceId]);

	return {
		canForceStop,
		forceStopWorkspaceRun,
		isRunning,
		isPending,
		toggleWorkspaceRun,
	};
}
