import {
	type AgentLaunchRequest,
	normalizeAgentLaunchRequest,
} from "@superset/shared/agent-launch";
import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useRef } from "react";
import { launchAgentSession } from "renderer/lib/agent-session-orchestrator";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useHostTerminalLauncher } from "renderer/lib/terminal/host-terminal-launcher";
import { buildTerminalCommand } from "renderer/lib/terminal/launch-command";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import {
	type PendingTerminalSetup,
	useAgentSessionLaunchStore,
} from "renderer/stores/agent-session-launch";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import { DEFAULT_AUTO_APPLY_DEFAULT_PRESET } from "shared/constants";

/** Mounted at app root to survive dialog unmounts. */
export function AgentSessionLaunchEffects() {
	const { activeHostUrl } = useLocalHostService();
	const pendingTerminalSetups = useAgentSessionLaunchStore(
		(s) => s.pendingTerminalSetups,
	);
	const removePendingTerminalSetup = useAgentSessionLaunchStore(
		(s) => s.removePendingTerminalSetup,
	);

	const { data: autoApplyDefaultPreset } =
		electronTrpc.settings.getAutoApplyDefaultPreset.useQuery();
	const shouldApplyPreset =
		autoApplyDefaultPreset ?? DEFAULT_AUTO_APPLY_DEFAULT_PRESET;

	const processingRef = useRef<Set<string>>(new Set());

	const addTab = useTabsStore((state) => state.addTab);
	const setTabAutoTitle = useTabsStore((state) => state.setTabAutoTitle);
	const { openPreset } = useTabsWithPresets();
	const terminalLauncher = useHostTerminalLauncher();

	const openPresetsInActiveTab = useCallback(
		(workspaceId: string, presets: PendingTerminalSetup["defaultPresets"]) => {
			for (const preset of presets ?? []) {
				if (preset.commands.length === 0) continue;
				openPreset(workspaceId, preset, { target: "active-tab" });
			}
		},
		[openPreset],
	);

	const resolveSetupLaunchRequest = useCallback(
		(setup: PendingTerminalSetup): AgentLaunchRequest | null => {
			if (setup.agentLaunchRequest) {
				return normalizeAgentLaunchRequest(setup.agentLaunchRequest);
			}
			if (setup.agentCommand) {
				return normalizeAgentLaunchRequest({
					workspaceId: setup.workspaceId,
					command: setup.agentCommand,
					name: "Agent",
					source: "command-watcher",
				});
			}
			return null;
		},
		[],
	);

	const launchAgentViaOrchestrator = useCallback(
		(setup: PendingTerminalSetup, targetPaneId?: string) => {
			let request: AgentLaunchRequest;
			try {
				const resolved = resolveSetupLaunchRequest(setup);
				if (!resolved) return false;
				request =
					targetPaneId &&
					resolved.kind === "terminal" &&
					!resolved.terminal.paneId
						? {
								...resolved,
								terminal: {
									...resolved.terminal,
									paneId: targetPaneId,
								},
							}
						: resolved;
			} catch (error) {
				console.error(
					"[AgentSessionLaunchEffects] Invalid launch request in pending setup:",
					error,
				);
				toast.error("Failed to start agent", {
					description:
						error instanceof Error
							? error.message
							: "Invalid launch request in workspace setup.",
				});
				return true;
			}

			void launchAgentSession(request, {
				source: "command-watcher",
				hostUrl: activeHostUrl ?? undefined,
				terminalLauncher,
			}).then((result) => {
				if (result.status === "failed") {
					toast.error("Failed to start agent", {
						description:
							result.error ??
							"Failed to start agent session in workspace setup.",
					});
				}
			});

			return true;
		},
		[activeHostUrl, resolveSetupLaunchRequest, terminalLauncher],
	);

	const runSetupCommandsInPane = useCallback(
		async (workspaceId: string, paneId: string, commands: string[] | null) => {
			const command = buildTerminalCommand(commands);
			if (!command) return;
			await terminalLauncher.launchCommand({
				workspaceId,
				terminalId: paneId,
				command,
			});
		},
		[terminalLauncher],
	);

	const handleTerminalSetup = useCallback(
		(setup: PendingTerminalSetup, onComplete: () => void) => {
			const hasSetupScript =
				Array.isArray(setup.initialCommands) &&
				setup.initialCommands.length > 0;
			const presets = (setup.defaultPresets ?? []).filter(
				(p) => p.commands.length > 0,
			);
			const hasPresets = shouldApplyPreset && presets.length > 0;
			const { agentCommand, agentLaunchRequest } = setup;

			if (hasSetupScript) {
				const { tabId, paneId } = addTab(setup.workspaceId);
				setTabAutoTitle(tabId, "Workspace Setup");
				if (hasPresets) {
					openPresetsInActiveTab(setup.workspaceId, presets);
				}
				if (agentLaunchRequest || agentCommand) {
					launchAgentViaOrchestrator(setup, paneId);
				}
				void runSetupCommandsInPane(
					setup.workspaceId,
					paneId,
					setup.initialCommands ?? null,
				)
					.catch((error) => {
						console.error(
							"[AgentSessionLaunchEffects] Failed to run setup commands:",
							error,
						);
						toast.error("Failed to run setup commands", {
							description:
								error instanceof Error ? error.message : String(error),
						});
					})
					.finally(onComplete);
				return;
			}

			if (hasPresets) {
				openPresetsInActiveTab(setup.workspaceId, presets);
				if (agentLaunchRequest || agentCommand) {
					launchAgentViaOrchestrator(setup);
				}
				onComplete();
				return;
			}

			if (agentLaunchRequest || agentCommand) {
				launchAgentViaOrchestrator(setup);
				onComplete();
				return;
			}

			onComplete();
		},
		[
			addTab,
			setTabAutoTitle,
			launchAgentViaOrchestrator,
			runSetupCommandsInPane,
			openPresetsInActiveTab,
			shouldApplyPreset,
		],
	);

	useEffect(() => {
		for (const [workspaceId, setup] of Object.entries(pendingTerminalSetups)) {
			if (processingRef.current.has(workspaceId)) {
				continue;
			}

			processingRef.current.add(workspaceId);
			handleTerminalSetup(setup, () => {
				removePendingTerminalSetup(workspaceId);
				processingRef.current.delete(workspaceId);
			});
		}
	}, [pendingTerminalSetups, removePendingTerminalSetup, handleTerminalSetup]);

	return null;
}
