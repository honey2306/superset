import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useAgentConfigs } from "renderer/hooks/useAgentConfigs";
import { readAgentModelPreference } from "renderer/hooks/useAgentModelPreference";
import { createDesktopAcpSessionClient } from "renderer/lib/acp-session-client";
import {
	ACP_SUPPORTED_AGENT_IDS,
	isAcpSupportedAgentId,
	launchAcpSession,
} from "renderer/lib/acp-session-launch";
import { useTranslation } from "renderer/providers/I18nProvider";
import { MODEL_STORAGE_KEY } from "renderer/routes/_local/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";

const DETECT_RUN_COMMAND_PROMPT = `Inspect this project and determine its primary local development startup command.

Check package manifests, package-manager lockfiles, README files, monorepo configuration, and framework tooling. Do not modify project source files. If you are confident and the project does not already have a Superset run command, call set_project_run_command with the command or commands you found. Then briefly explain the evidence for your choice. If the correct command is ambiguous, do not configure anything; explain the candidates instead.`;

interface DetectRunCommandButtonProps {
	hostUrl: string;
	workspaceId: string | null;
	hasRunCommand: boolean;
}

export function selectAcpAgentDefinitionId(
	agentConfigs: ReadonlyArray<{ presetId: string | null }>,
) {
	return (
		ACP_SUPPORTED_AGENT_IDS.find((supportedId) =>
			agentConfigs.some((agentConfig) => agentConfig.presetId === supportedId),
		) ?? null
	);
}

function isTransientAcpDaemonError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return (
		error.message.includes("ACP daemon disconnected") ||
		error.message.includes("ACP daemon is not connected")
	);
}

export async function retryAcpDaemonDisconnect<T>(
	operation: () => Promise<T>,
	maxAttempts = 3,
): Promise<T> {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			if (attempt >= maxAttempts || !isTransientAcpDaemonError(error)) {
				throw error;
			}
		}
	}
}

export function DetectRunCommandButton({
	hostUrl,
	workspaceId,
	hasRunCommand,
}: DetectRunCommandButtonProps) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const agentConfigsQuery = useAgentConfigs(hostUrl);
	const acpAvailabilityQuery = useQuery({
		queryKey: ["acp-availability", hostUrl, workspaceId],
		enabled: Boolean(workspaceId),
		queryFn: () =>
			createDesktopAcpSessionClient(hostUrl).list({
				workspaceId: workspaceId ?? "",
				limit: 1,
			}),
	});
	const [isLaunching, setIsLaunching] = useState(false);
	const agentDefinitionId = useMemo(
		() => selectAcpAgentDefinitionId(agentConfigsQuery.data ?? []),
		[agentConfigsQuery.data],
	);

	const handleClick = async () => {
		if (
			!workspaceId ||
			!agentDefinitionId ||
			!isAcpSupportedAgentId(agentDefinitionId)
		) {
			return;
		}
		setIsLaunching(true);
		try {
			const client = createDesktopAcpSessionClient(hostUrl);
			const sessionId = crypto.randomUUID();
			const commandId = crypto.randomUUID();
			await retryAcpDaemonDisconnect(() =>
				launchAcpSession({
					workspaceId,
					agentDefinitionId,
					client,
					sessionId,
					model:
						readAgentModelPreference(MODEL_STORAGE_KEY, agentDefinitionId) ??
						undefined,
					openPane: () => {},
				}),
			);
			await retryAcpDaemonDisconnect(() =>
				client.api.prompt({
					sessionId,
					commandId,
					prompt: [{ type: "text", text: DETECT_RUN_COMMAND_PROMPT }],
				}),
			);
			await navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId },
				search: { acpSessionId: sessionId },
			});
		} catch (error) {
			toast.error(t("scripts.detectWithAcpFailed"), {
				description:
					error instanceof Error
						? error.message
						: t("scripts.detectWithAcpTryAgain"),
			});
			setIsLaunching(false);
		}
	};

	const agentUnavailable = agentConfigsQuery.isFetched && !agentDefinitionId;
	const daemonUnavailable =
		acpAvailabilityQuery.isError ||
		(acpAvailabilityQuery.isSuccess && !acpAvailabilityQuery.data.enabled);
	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			className="h-7 gap-1.5 px-2.5 text-xs"
			disabled={
				isLaunching ||
				hasRunCommand ||
				!workspaceId ||
				agentUnavailable ||
				daemonUnavailable ||
				!agentConfigsQuery.isFetched ||
				!acpAvailabilityQuery.isSuccess
			}
			onClick={() => void handleClick()}
			title={
				hasRunCommand
					? t("scripts.detectWithAcpAlreadyConfigured")
					: agentUnavailable
						? t("scripts.detectWithAcpUnavailable")
						: daemonUnavailable
							? t("scripts.detectWithAcpDaemonUnavailable")
							: undefined
			}
		>
			{isLaunching ? (
				<Loader2 className="size-3.5 animate-spin" />
			) : (
				<Sparkles className="size-3.5" />
			)}
			{isLaunching
				? t("scripts.detectWithAcpLaunching")
				: t("scripts.detectWithAcp")}
		</Button>
	);
}
