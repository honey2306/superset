import type { HostAgentConfig } from "@superset/host-service/settings";
import type { TerminalPreset } from "@superset/shared/desktop-types";
import { getPresetById } from "@superset/shared/host-agent-presets";
import { useMemo } from "react";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { useAgentConfigs } from "renderer/hooks/useAgentConfigs";
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
			const bundledPreset = config ? null : getPresetById(normalizedName);
			const resolved = config ?? bundledPreset;
			if (!resolved) return [];
			const id = config?.id ?? resolved.presetId;
			if (seen.has(id)) return [];
			seen.add(id);
			return [
				{
					id,
					label: resolved.label,
					iconId: config?.iconId ?? resolved.presetId,
				},
			];
		});
}

export function useAutomationAgentChoices(
	hostUrl: string | null,
	projectId?: string | null,
) {
	const query = useAgentConfigs(hostUrl);
	const { matchedPresets: presets = [] } = usePresets(projectId);
	const agents = useMemo(
		() => toAutomationAgentChoices(query.data ?? [], presets),
		[query.data, presets],
	);

	return { agents, isFetched: query.isFetched };
}
