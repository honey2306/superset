import type { HostAgentConfig } from "@superset/host-service/settings";
import { getPresetById } from "@superset/shared/host-agent-presets";
import { useMemo } from "react";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { ACP_SUPPORTED_AGENT_IDS } from "renderer/lib/acp-session-launch";

export function toAutomationAgentChoices(
	configs: HostAgentConfig[],
): AgentSelectAgent[] {
	return ACP_SUPPORTED_AGENT_IDS.flatMap((presetId) => {
		const configured = configs.filter((config) => config.presetId === presetId);
		if (configured.length > 0) {
			return configured.map((config) => ({
				id: config.id,
				label: config.label,
				iconId: config.iconId ?? presetId,
			}));
		}

		const preset = getPresetById(presetId);
		return preset
			? [{ id: presetId, label: preset.label, iconId: presetId }]
			: [];
	});
}

export function useAutomationAgentChoices(hostUrl: string | null) {
	const query = useV2AgentConfigs(hostUrl);
	const agents = useMemo(
		() => toAutomationAgentChoices(query.data ?? []),
		[query.data],
	);

	return { agents, isFetched: query.isFetched };
}
