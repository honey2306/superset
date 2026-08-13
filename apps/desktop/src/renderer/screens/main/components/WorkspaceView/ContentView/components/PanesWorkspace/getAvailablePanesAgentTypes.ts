import { AGENT_TYPES, type AgentType } from "@superset/shared/agent-command";
import type { TerminalPreset } from "@superset/shared/desktop-types";

type PresetName = Pick<TerminalPreset, "name">;

export function getAvailablePanesAgentTypes(
	matchedPresets: readonly PresetName[],
): AgentType[] {
	const existingNames = new Set(
		matchedPresets.map((preset) => preset.name.trim().toLowerCase()),
	);
	return AGENT_TYPES.filter((agent) => !existingNames.has(agent));
}

export function canCreatePanesAgentPreset({
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
		getAvailablePanesAgentTypes(matchedPresets).includes(agent)
	);
}
