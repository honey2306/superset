import {
	ACP_AGENT_HARNESS_BY_AGENT_ID,
	BUILTIN_AGENT_DEFINITIONS,
} from "@superset/shared/agent-catalog";
import { BUILTIN_TERMINAL_AGENTS } from "@superset/shared/builtin-terminal-agents";

const builtinAgentById = new Map(
	BUILTIN_AGENT_DEFINITIONS.map((agent) => [agent.id, agent]),
);

export const acpAgentLaunchOptions = Object.entries(
	ACP_AGENT_HARNESS_BY_AGENT_ID,
).map(([agentId, harness]) => {
	const definition = builtinAgentById.get(agentId);
	if (!definition) throw new Error(`Missing agent definition: ${agentId}`);
	return {
		agentId,
		harness,
		label: definition.label,
		description: definition.description,
	};
});

export const terminalAgentLaunchOptions = BUILTIN_TERMINAL_AGENTS.map(
	(agent) => ({ agentId: agent.id }),
);
