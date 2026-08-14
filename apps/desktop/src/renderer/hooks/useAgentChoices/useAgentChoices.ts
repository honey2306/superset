import { useMemo } from "react";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { useAgentConfigs } from "renderer/hooks/useAgentConfigs";

interface UseAgentChoicesResult {
	agents: AgentSelectAgent[];
	isFetched: boolean;
}

export function useAgentChoices(hostUrl: string | null): UseAgentChoicesResult {
	const query = useAgentConfigs(hostUrl);
	const agents = useMemo<AgentSelectAgent[]>(() => {
		return (query.data ?? []).map((config) => ({
			id: config.id,
			label: config.label,
			// Prefer the user's icon override (built-in key or uploaded data
			// URI); fall back to the preset-implied icon.
			iconId: config.iconId ?? config.presetId,
		}));
	}, [query.data]);

	return { agents, isFetched: query.isFetched };
}
