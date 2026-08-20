import { toast } from "@superset/ui/sonner";
import { useCallback, useRef, useState } from "react";
import { useWorkspaceRunDefinition } from "renderer/hooks/host-service/useWorkspaceRunDefinition";
import {
	addTerminalPane,
	createWorkspaceRunSingleFlight,
	findPane,
	focusPane,
	updatePaneData,
	usePanesWorkspaceState,
} from "renderer/lib/panes";
import { useHostTerminalLauncher } from "renderer/lib/terminal/host-terminal-launcher";
import { buildTerminalCommand } from "renderer/lib/terminal/launch-command";
import { createWorkspaceRunStartPlan } from "./workspace-run-start-plan";

interface UseWorkspaceRunCommandOptions {
	workspaceId: string;
	worktreePath?: string | null;
}

const CTRL_C_INPUT = "\u0003";

function isTerminalUnavailableMessage(message: string): boolean {
	return (
		message.includes("not found") ||
		message.includes("not alive") ||
		message.includes("has exited") ||
		message.includes("disposed")
	);
}

export function useWorkspaceRunCommand({
	workspaceId,
	worktreePath,
}: UseWorkspaceRunCommandOptions) {
	const singleFlightRef = useRef(createWorkspaceRunSingleFlight());
	const [isPending, setIsPending] = useState(false);
	const { refetch: refetchRunDefinition } =
		useWorkspaceRunDefinition(workspaceId);
	const terminalLauncher = useHostTerminalLauncher();
	const panesState = usePanesWorkspaceState(workspaceId);
	const runPane = (() => {
		const panes = panesState.tabs.flatMap((tab) =>
			Object.values(tab.panes).map((pane) => ({ tabId: tab.id, pane })),
		);
		return (
			panes.find(
				({ pane }) =>
					pane.kind === "terminal" &&
					pane.data.workspaceRun?.workspaceId === workspaceId &&
					pane.data.workspaceRun.state === "running",
			) ??
			panes.find(
				({ pane }) =>
					pane.kind === "terminal" &&
					pane.data.workspaceRun?.workspaceId === workspaceId,
			) ??
			null
		);
	})();
	const isRunning = runPane?.pane.data.workspaceRun?.state === "running";

	const setRunState = useCallback(
		(
			paneId: string,
			state: "running" | "stopped-by-user" | "stopped-by-exit",
		) =>
			updatePaneData(workspaceId, paneId, (data) =>
				data.workspaceRun
					? { ...data, workspaceRun: { ...data.workspaceRun, state } }
					: data,
			),
		[workspaceId],
	);

	const toggleWorkspaceRun = useCallback(async () => {
		if (singleFlightRef.current.isActive()) return;
		const liveRun = findPane(
			workspaceId,
			(data, kind) =>
				kind === "terminal" &&
				data.workspaceRun?.workspaceId === workspaceId &&
				data.workspaceRun.state === "running",
		);
		if (liveRun) {
			setIsPending(true);
			try {
				await terminalLauncher.write({
					terminalId: liveRun.paneId,
					workspaceId,
					data: CTRL_C_INPUT,
				});
				setRunState(liveRun.paneId, "stopped-by-user");
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				if (isTerminalUnavailableMessage(message)) {
					setRunState(liveRun.paneId, "stopped-by-exit");
				} else {
					toast.error("Failed to stop workspace run command", {
						description: message,
					});
				}
			} finally {
				setIsPending(false);
			}
			return;
		}

		if (!singleFlightRef.current.tryStart()) return;
		setIsPending(true);
		try {
			const { data: runDefinition } = await refetchRunDefinition();
			const command = buildTerminalCommand(runDefinition?.commands);
			if (!command) {
				toast.error("No workspace run command configured", {
					description:
						"Add a run script in Project Settings or mark a preset as the workspace run.",
				});
				return;
			}
			const initialCwd =
				runDefinition?.cwd ?? (worktreePath?.trim() || undefined);
			const existingStoppedByUser = findPane(
				workspaceId,
				(data, kind) =>
					kind === "terminal" &&
					data.workspaceRun?.workspaceId === workspaceId &&
					data.workspaceRun.state === "stopped-by-user",
			);
			const plan = createWorkspaceRunStartPlan({
				command,
				initialCwd,
				existingPane: existingStoppedByUser
					? {
							paneId: existingStoppedByUser.paneId,
							state: "stopped-by-user",
						}
					: null,
			});

			if (plan.kind === "write-existing") {
				let shouldCreateNewPane = false;
				focusPane(workspaceId, plan.paneId);
				updatePaneData(workspaceId, plan.paneId, (data) => ({
					...data,
					workspaceRun: { workspaceId, state: "running", command },
				}));
				try {
					await terminalLauncher.write({
						terminalId: plan.paneId,
						workspaceId,
						data: plan.data,
					});
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown error";
					setRunState(plan.paneId, "stopped-by-exit");
					if (!isTerminalUnavailableMessage(message)) {
						toast.error("Failed to run workspace command", {
							description: message,
						});
						return;
					}
					shouldCreateNewPane = true;
				}
				if (!shouldCreateNewPane) return;
			}

			const newPanePlan =
				plan.kind === "new-pane"
					? plan
					: {
							kind: "new-pane" as const,
							initialCommand: command,
							initialCwd,
						};
			const result = addTerminalPane(workspaceId, {
				initialCwd: newPanePlan.initialCwd,
				initialCommand: newPanePlan.initialCommand,
				title: "Workspace Run",
				data: {
					workspaceRun: { workspaceId, state: "running", command },
				},
				dedupeKey: `workspace-run:${workspaceId}`,
			});
			if (result.status === "rejected") {
				toast.error("Workspace panes are not available yet");
			}
		} catch (error) {
			toast.error("Failed to resolve workspace run command", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			singleFlightRef.current.finish();
			setIsPending(false);
		}
	}, [
		refetchRunDefinition,
		setRunState,
		terminalLauncher,
		workspaceId,
		worktreePath,
	]);

	const forceStopWorkspaceRun = useCallback(async () => {
		const liveRun = findPane(
			workspaceId,
			(data) => data.workspaceRun?.state === "running",
		);
		if (!liveRun || singleFlightRef.current.isActive()) return;
		setIsPending(true);
		try {
			await terminalLauncher.kill({
				terminalId: liveRun.paneId,
				workspaceId,
			});
			setRunState(liveRun.paneId, "stopped-by-user");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			if (isTerminalUnavailableMessage(message)) {
				setRunState(liveRun.paneId, "stopped-by-exit");
			} else {
				toast.error("Failed to force stop workspace run command", {
					description: message,
				});
			}
		} finally {
			setIsPending(false);
		}
	}, [setRunState, terminalLauncher, workspaceId]);

	return {
		canForceStop: Boolean(isRunning && runPane),
		forceStopWorkspaceRun,
		isRunning,
		isPending,
		toggleWorkspaceRun,
	};
}
