let enabled = process.env.SUPERSET_USE_ACP_FOR_AGENT_PRESETS === "1";

export function useAcpForAgentPresets(): boolean {
	return enabled;
}

export function setAcpForAgentPresets(value: boolean): boolean {
	enabled = value;
	return enabled;
}
