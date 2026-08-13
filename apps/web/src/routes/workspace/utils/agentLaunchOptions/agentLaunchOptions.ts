import { ACP_AGENT_HARNESS_BY_AGENT_ID } from "@superset/shared/agent-catalog";
import { BUILTIN_TERMINAL_AGENTS } from "@superset/shared/builtin-terminal-agents";

export const acpAgentLaunchOptions = Object.entries(
	ACP_AGENT_HARNESS_BY_AGENT_ID,
).map(([agentId, harness]) => ({ agentId, harness }));

export const terminalAgentLaunchOptions = BUILTIN_TERMINAL_AGENTS.map(
	(agent) => ({ agentId: agent.id }),
);
