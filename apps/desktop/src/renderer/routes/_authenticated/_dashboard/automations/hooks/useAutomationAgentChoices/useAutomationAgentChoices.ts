import type { HostAgentConfig } from "@superset/host-service/settings";
import type { TerminalPreset } from "@superset/local-db";
import { useMemo } from "react";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { usePresets } from "renderer/react-query/presets";

export function toAutomationAgentChoices(
	configs: HostAgentConfig[],
	presets: readonly TerminalPreset[],
): AgentSelectAgent[] {
	const seen = new Set<string>();
	return presets
		.filter((preset) => preset.pinnedToBar !== false)
		.flatMap((preset) => {
			const normalizedName = preset.name.trim().toLowerCase();
			const config = configs.find(
				(candidate) => candidate.presetId === normalizedName,
			);
			if (!config || seen.has(config.id)) return [];
			seen.add(config.id);
			return [
				{
					id: config.id,
					label: config.label,
					iconId: config.iconId ?? config.presetId,
				},
			];
		});
}

export function useAutomationAgentChoices(
	hostUrl: string | null,
	projectId?: string | null,
) {
	const query = useV2AgentConfigs(hostUrl);
	const { matchedPresets: presets = [] } = usePresets(projectId);
	const agents = useMemo(
		() => toAutomationAgentChoices(query.data ?? [], presets),
		[query.data, presets],
	);

	return { agents, isFetched: query.isFetched };
}
