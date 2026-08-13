import { useMemo } from "react";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { useAgentConfigs } from "renderer/hooks/useAgentConfigs";

interface UseAgentChoicesResult {
	agents: AgentSelectAgent[];
	isFetched: boolean;
}

const SUPERSET_AGENT: AgentSelectAgent = {
	id: "superset",
	label: "Superset",
	iconId: "superset",
};

// Superset chat isn't in the host's `host_agent_configs` table — it's
// routed by id inside `runAgentInWorkspace`. Append after the host's
// terminal rows so the user's preferred terminal agents stay on top.
export function useAgentChoices(hostUrl: string | null): UseAgentChoicesResult {
	const query = useAgentConfigs(hostUrl);
	const agents = useMemo<AgentSelectAgent[]>(() => {
		const terminalAgents: AgentSelectAgent[] = (query.data ?? []).map(
			(config) => ({
				id: config.id,
				label: config.label,
				// Prefer the user's icon override (built-in key or uploaded data
				// URI); fall back to the preset-implied icon.
				iconId: config.iconId ?? config.presetId,
			}),
		);
		return [...terminalAgents, SUPERSET_AGENT];
	}, [query.data]);

	return { agents, isFetched: query.isFetched };
}
