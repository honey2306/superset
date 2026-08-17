import type { HostAgentConfig } from "@superset/host-service/settings";
import { getPresetById } from "@superset/shared/host-agent-presets";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";

const ACP_PRESET_IDS = new Set(["claude", "codex", "pi", "myflicker"]);

export function toDelegatedExecutionAgentChoices(
	agents: AgentSelectAgent[],
	configs: HostAgentConfig[],
): AgentSelectAgent[] {
	return agents.filter((agent) => {
		const presetId =
			configs.find((config) => config.id === agent.id)?.presetId ??
			getPresetById(agent.id)?.presetId;
		return presetId !== undefined && ACP_PRESET_IDS.has(presetId);
	});
}

export function getDelegatedExecutionPresetId(
	configId: string | null,
	configs: HostAgentConfig[],
): string | undefined {
	if (!configId) return undefined;
	return (
		configs.find((config) => config.id === configId)?.presetId ??
		getPresetById(configId)?.presetId
	);
}
