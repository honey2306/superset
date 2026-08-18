import type {
	AgentDefinition,
	AgentDefinitionSource,
	AgentKind,
	TerminalAgentDefinition,
} from "./agent-definition";
import {
	BUILTIN_TERMINAL_AGENT_TYPES,
	BUILTIN_TERMINAL_AGENTS,
} from "./builtin-terminal-agents";

export const BUILTIN_AGENT_IDS = BUILTIN_TERMINAL_AGENT_TYPES;

export type BuiltinAgentId = (typeof BUILTIN_AGENT_IDS)[number];
export type AgentDefinitionId = BuiltinAgentId | `custom:${string}`;

/**
 * The built-in agents that have a first-class ACP adapter. Keep the launch
 * identity beside the agent catalog rather than teaching every client its own
 * mapping; desktop and phone can then present the same supported choices.
 */
export const ACP_AGENT_HARNESS_BY_AGENT_ID = {
	claude: "claude-agent-acp",
	codex: "codex-app-server",
	pi: "pi-acp",
	myflicker: "myflicker-acp",
	deepseek: "deepseek-acp",
} as const satisfies Partial<Record<BuiltinAgentId, string>>;

export type AcpSupportedAgentId = keyof typeof ACP_AGENT_HARNESS_BY_AGENT_ID;

/**
 * Agents Superset can identify via lifecycle hooks but cannot launch —
 * they run in an external app whose hooks land on a Superset terminal.
 */
export const EXTERNAL_AGENT_IDS = ["cursor-composer"] as const;

export const AGENT_IDENTITY_IDS = [
	...BUILTIN_AGENT_IDS,
	...EXTERNAL_AGENT_IDS,
] as const;

export type AgentIdentityId = (typeof AGENT_IDENTITY_IDS)[number];

export type {
	AgentDefinition,
	AgentDefinitionSource,
	AgentKind,
	TerminalAgentDefinition,
};

export const BUILTIN_AGENT_LABELS = Object.fromEntries(
	BUILTIN_TERMINAL_AGENTS.map((agent) => [agent.id, agent.label]),
) as Record<BuiltinAgentId, string>;

export const AGENT_IDENTITY_LABELS: Record<AgentIdentityId, string> = {
	...BUILTIN_AGENT_LABELS,
	"cursor-composer": "Cursor Composer",
};

export const BUILTIN_AGENT_DEFINITIONS: readonly AgentDefinition[] =
	BUILTIN_TERMINAL_AGENTS;

export function getBuiltinAgentDefinition(id: BuiltinAgentId): AgentDefinition {
	const definition = BUILTIN_AGENT_DEFINITIONS.find((item) => item.id === id);
	if (!definition) {
		throw new Error(`Unknown built-in agent definition: ${id}`);
	}
	return definition;
}

export function isTerminalAgentDefinition(
	definition: AgentDefinition,
): definition is TerminalAgentDefinition {
	return definition.kind === "terminal";
}

export function isBuiltinAgentId(id: string): id is BuiltinAgentId {
	return (BUILTIN_AGENT_IDS as readonly string[]).includes(id);
}

export function isCustomAgentId(id: string): id is `custom:${string}` {
	return id.startsWith("custom:");
}
