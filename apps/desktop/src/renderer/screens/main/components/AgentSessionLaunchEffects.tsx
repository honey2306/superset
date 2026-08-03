import {
	type AgentLaunchRequest,
	normalizeAgentLaunchRequest,
} from "@superset/shared/agent-launch";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { toast } from "@superset/ui/sonner";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useEffect, useRef } from "react";
import { useCreateOrAttachWithTheme } from "renderer/hooks/useCreateOrAttachWithTheme";
import { launchAgentSession } from "renderer/lib/agent-session-orchestrator";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	buildTerminalCommand,
	writeCommandsInPane,
} from "renderer/lib/terminal/launch-command";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { isTerminalAttachCanceledMessage } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/attach-cancel";
import { waitForV1HostTerminalBackend } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/v1-host-terminal-backend";
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
	const hostTerminalEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.V1_HOST_SERVICE_TERMINAL) ?? false;

	const { data: autoApplyDefaultPreset } =
		electronTrpc.settings.getAutoApplyDefaultPreset.useQuery();
	const shouldApplyPreset =
		autoApplyDefaultPreset ?? DEFAULT_AUTO_APPLY_DEFAULT_PRESET;

	const processingRef = useRef<Set<string>>(new Set());

	const addTab = useTabsStore((state) => state.addTab);
	const setTabAutoTitle = useTabsStore((state) => state.setTabAutoTitle);
	const { openPreset } = useTabsWithPresets();
	const createOrAttach = useCreateOrAttachWithTheme();
	const terminalCreateOrAttach =
		electronTrpc.terminal.createOrAttach.useMutation();
	const terminalWrite = electronTrpc.terminal.write.useMutation();

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
				createOrAttach: (input) => terminalCreateOrAttach.mutateAsync(input),
				write: (input) => terminalWrite.mutateAsync(input),
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
		[
			activeHostUrl,
			resolveSetupLaunchRequest,
			terminalCreateOrAttach,
			terminalWrite,
		],
	);

	const runSetupCommandsInPane = useCallback(
		async (paneId: string, commands: string[] | null) => {
			if (hostTerminalEnabled) {
				const command = buildTerminalCommand(commands);
				if (!command) return;
				const pane = useTabsStore.getState().panes[paneId];
				const tab = pane
					? useTabsStore
							.getState()
							.tabs.find((candidate) => candidate.id === pane.tabId)
					: null;
				if (!tab) throw new Error(`Setup pane not found: ${paneId}`);
				const backend = await waitForV1HostTerminalBackend(tab.workspaceId);
				await getHostServiceClientByUrl(
					backend.hostUrl,
				).terminal.createSession.mutate({
					terminalId: paneId,
					workspaceId: backend.hostWorkspaceId,
					initialCommand: command,
				});
				return;
			}
			await writeCommandsInPane({
				paneId,
				commands,
				write: (input) => terminalWrite.mutateAsync(input),
			});
		},
		[hostTerminalEnabled, terminalWrite],
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

			if (hostTerminalEnabled && hasSetupScript) {
				const { tabId, paneId } = addTab(setup.workspaceId);
				setTabAutoTitle(tabId, "Workspace Setup");
				openPresetsInActiveTab(setup.workspaceId, presets);
				if (agentLaunchRequest || agentCommand) {
					launchAgentViaOrchestrator(setup, paneId);
				}
				void runSetupCommandsInPane(paneId, setup.initialCommands ?? null)
					.catch((error) => {
						console.error(
							"[AgentSessionLaunchEffects] Failed to run host setup commands:",
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

			if (hasSetupScript && hasPresets) {
				const { tabId: setupTabId, paneId: setupPaneId } = addTab(
					setup.workspaceId,
				);
				setTabAutoTitle(setupTabId, "Workspace Setup");
				openPresetsInActiveTab(setup.workspaceId, presets);

				if (agentLaunchRequest || agentCommand) {
					launchAgentViaOrchestrator(setup, setupPaneId);
				}

				createOrAttach.mutate(
					{
						paneId: setupPaneId,
						tabId: setupTabId,
						workspaceId: setup.workspaceId,
						joinPending: true,
					},
					{
						onSuccess: () => {
							void runSetupCommandsInPane(
								setupPaneId,
								setup.initialCommands ?? null,
							)
								.catch((error) => {
									console.error(
										"[AgentSessionLaunchEffects] Failed to run setup commands:",
										error,
									);
									toast.error("Failed to run setup commands", {
										description:
											error instanceof Error
												? error.message
												: "Failed to execute setup commands.",
									});
								})
								.finally(() => onComplete());
						},
						onError: (error) => {
							if (isTerminalAttachCanceledMessage(error.message)) {
								onComplete();
								return;
							}
							console.error(
								"[AgentSessionLaunchEffects] Failed to create terminal:",
								error,
							);
							toast.error("Failed to create terminal", {
								description:
									error.message || "Terminal setup failed. Please try again.",
							});
							onComplete();
						},
					},
				);
				return;
			}

			if (hasSetupScript) {
				const { tabId, paneId } = addTab(setup.workspaceId);
				setTabAutoTitle(tabId, "Workspace Setup");

				if (agentLaunchRequest || agentCommand) {
					launchAgentViaOrchestrator(setup, paneId);
				}

				createOrAttach.mutate(
					{
						paneId,
						tabId,
						workspaceId: setup.workspaceId,
						joinPending: true,
					},
					{
						onSuccess: () => {
							void runSetupCommandsInPane(paneId, setup.initialCommands ?? null)
								.catch((error) => {
									console.error(
										"[AgentSessionLaunchEffects] Failed to run setup commands:",
										error,
									);
									toast.error("Failed to run setup commands", {
										description:
											error instanceof Error
												? error.message
												: "Failed to execute setup commands.",
									});
								})
								.finally(() => onComplete());
						},
						onError: (error) => {
							if (isTerminalAttachCanceledMessage(error.message)) {
								onComplete();
								return;
							}
							console.error(
								"[AgentSessionLaunchEffects] Failed to create terminal:",
								error,
							);
							toast.error("Failed to create terminal", {
								description:
									error.message || "Terminal setup failed. Please try again.",
								action: {
									label: "Open Terminal",
									onClick: () => {
										const { tabId: newTabId, paneId: newPaneId } = addTab(
											setup.workspaceId,
										);
										createOrAttach.mutate(
											{
												paneId: newPaneId,
												tabId: newTabId,
												workspaceId: setup.workspaceId,
												joinPending: true,
											},
											{
												onSuccess: () => {
													void runSetupCommandsInPane(
														newPaneId,
														setup.initialCommands ?? null,
													).catch((runError) => {
														console.error(
															"[AgentSessionLaunchEffects] Failed to run setup commands:",
															runError,
														);
														toast.error("Failed to run setup commands", {
															description:
																runError instanceof Error
																	? runError.message
																	: "Failed to execute setup commands.",
														});
													});
												},
											},
										);
									},
								},
							});
							onComplete();
						},
					},
				);
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
			createOrAttach,
			launchAgentViaOrchestrator,
			runSetupCommandsInPane,
			openPresetsInActiveTab,
			shouldApplyPreset,
			hostTerminalEnabled,
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
