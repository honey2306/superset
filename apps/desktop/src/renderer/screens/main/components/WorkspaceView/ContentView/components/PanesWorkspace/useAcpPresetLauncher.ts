import type { WorkspaceStore } from "@superset/panes";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readAgentModelPreference } from "renderer/hooks/useAgentModelPreference";
import { createDesktopAcpSessionClient } from "renderer/lib/acp-session-client";
import {
	ACP_SUPPORTED_AGENT_IDS,
	type AcpAgentDefinitionId,
	isAcpSupportedAgentId,
	launchAcpSession,
} from "renderer/lib/acp-session-launch";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { MODEL_STORAGE_KEY } from "renderer/routes/_local/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { useAcpForAgentPresets } from "renderer/screens/main/components/WorkspaceView/ContentView/hooks/useAcpForAgentPresets";
import type { StoreApi } from "zustand/vanilla";
import { openAcpSessionInPanesStore } from "./openAcpSessionInPanesStore";
import type { PanesPaneData } from "./types";
import type { AcpPresetLauncher } from "./usePanesPresetOpeners";

interface UseAcpPresetLauncherInput {
	store: StoreApi<WorkspaceStore<PanesPaneData>>;
	hostUrl: string | null | undefined;
	hostWorkspaceId: string | null | undefined;
	/** Keep-alive mounts remain rendered, but only the routed workspace may launch. */
	isWorkspaceActive: boolean;
}

/**
 * Assembles the ACP preset launcher. Returns `undefined` — meaning "no ACP
 * takeover, fall through to the terminal path" — unless:
 * - the `useAcpForAgentPresets` setting is on,
 * - the host has ACP support (feature-detected via `acpSessions.list`),
 * - and workspace/host coordinates are known.
 *
 * `launchByPresetName` matches the normalized preset name against
 * `ACP_SUPPORTED_AGENT_IDS`. Unsupported names (e.g. `amp`, `gemini`) return
 * `false` so the caller falls back to the terminal preset path.
 */
export function useAcpPresetLauncher({
	store,
	hostUrl,
	hostWorkspaceId,
	isWorkspaceActive,
}: UseAcpPresetLauncherInput): AcpPresetLauncher | undefined {
	const { useAcpForAgentPresets: settingEnabled } = useAcpForAgentPresets();

	// Piggy-back on `acpSessions.list` for feature detection; the router returns
	// `enabled: false` when the host-side ACP flag is off. Skipping the call when
	// the setting itself is off avoids paying the RPC cost for the default path.
	const [hostSupportsAcp, setHostSupportsAcp] = useState(false);
	useEffect(() => {
		if (!settingEnabled || !isWorkspaceActive || !hostUrl || !hostWorkspaceId) {
			setHostSupportsAcp(false);
			return;
		}
		setHostSupportsAcp(false);
		let disposed = false;
		const client = getHostServiceClientByUrl(hostUrl);
		client.acpSessions.list
			.query({ workspaceId: hostWorkspaceId, limit: 1 })
			.then((page) => {
				if (disposed) return;
				setHostSupportsAcp(page.enabled);
			})
			.catch((err) => {
				if (disposed) return;
				console.warn("[useAcpPresetLauncher] ACP feature-detect failed", err);
			});
		return () => {
			disposed = true;
		};
	}, [settingEnabled, isWorkspaceActive, hostUrl, hostWorkspaceId]);

	const launchAgent = useCallback(
		(agentDefinitionId: AcpAgentDefinitionId) => {
			if (!isWorkspaceActive || !hostUrl || !hostWorkspaceId) return;
			const client = createDesktopAcpSessionClient(hostUrl);
			const onOpen = (input: {
				sessionId: string;
				agentDefinitionId: AcpAgentDefinitionId;
				title: string | null;
				status?: import("@superset/session-protocol").SessionStatus;
				isLaunching?: boolean;
				creationError?: string;
			}) => openAcpSessionInPanesStore(store, input);
			// agentDefinitionId doubles as the presetId for built-in agents, so
			// the workspace-create model preference applies here too.
			const model =
				readAgentModelPreference(MODEL_STORAGE_KEY, agentDefinitionId) ??
				undefined;
			void launchAcpSession({
				workspaceId: hostWorkspaceId,
				agentDefinitionId,
				client,
				model,
				openPane: onOpen,
				onSessionCreated: ({ sessionId, title, status }) => {
					onOpen({
						sessionId,
						agentDefinitionId,
						title,
						status,
						isLaunching: false,
					});
				},
				onSessionCreationFailed: ({ sessionId, error }) => {
					onOpen({
						sessionId,
						agentDefinitionId,
						title: null,
						status: "dead",
						isLaunching: false,
						creationError: error.message,
					});
				},
			}).catch(async (err) => {
				console.error(
					`[useAcpPresetLauncher] failed to create ${agentDefinitionId} session`,
					err,
				);
				const { toast } = await import("@superset/ui/sonner");
				toast.error(`Failed to create ${agentDefinitionId} session`, {
					description: err instanceof Error ? err.message : "Please try again.",
				});
			});
		},
		[store, isWorkspaceActive, hostUrl, hostWorkspaceId],
	);

	return useMemo<AcpPresetLauncher | undefined>(() => {
		if (
			!settingEnabled ||
			!isWorkspaceActive ||
			!hostSupportsAcp ||
			!hostUrl ||
			!hostWorkspaceId
		) {
			return undefined;
		}
		return {
			launchByPresetName(normalizedName: string): boolean {
				if (!isAcpSupportedAgentId(normalizedName)) return false;
				launchAgent(normalizedName);
				return true;
			},
		};
	}, [
		settingEnabled,
		isWorkspaceActive,
		hostSupportsAcp,
		hostUrl,
		hostWorkspaceId,
		launchAgent,
	]);
}

// Re-export for convenience when adding new ACP-eligible agents.
export { ACP_SUPPORTED_AGENT_IDS };
