import type { TerminalPreset } from "@superset/local-db/schema/zod";
import { AGENT_TYPES, type AgentType } from "@superset/shared/agent-command";

type PresetName = Pick<TerminalPreset, "name">;

export function getAvailableV1PanesAgentTypes(
	matchedPresets: readonly PresetName[],
): AgentType[] {
	const existingNames = new Set(
		matchedPresets.map((preset) => preset.name.trim().toLowerCase()),
	);
	return AGENT_TYPES.filter((agent) => !existingNames.has(agent));
}

export function canCreateV1PanesAgentPreset({
	agent,
	matchedPresets,
	isPending,
	inFlightAgentTypes,
}: {
	agent: AgentType;
	matchedPresets: readonly PresetName[];
	isPending: boolean;
	inFlightAgentTypes: ReadonlySet<AgentType>;
}): boolean {
	return (
		!isPending &&
		!inFlightAgentTypes.has(agent) &&
		getAvailableV1PanesAgentTypes(matchedPresets).includes(agent)
	);
}
