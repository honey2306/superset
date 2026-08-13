import type { AgentType } from "@superset/shared/agent-command";

export interface PanesPresetAgentLaunch {
	terminalId: string;
	agentName: AgentType | undefined;
	initialCommand: string | undefined;
	fallbackCommand: string | undefined;
}

export interface PanesResolvedPresetLaunch {
	initialCommand: string | undefined;
	usedFormalAgentLaunch: boolean;
}

/**
 * Launch built-in terminal agents through host-service. If the host rejects a
 * configured or unavailable agent, retain the v1 terminal-native behavior by
 * spawning its preset command; the resulting shell error remains visible and
 * testable instead of silently dropping the click.
 */
export async function resolvePanesPresetLaunch(
	plan: PanesPresetAgentLaunch,
	launchAgent: (input: {
		terminalId: string;
		agent: AgentType;
	}) => Promise<void>,
): Promise<PanesResolvedPresetLaunch> {
	if (!plan.agentName) {
		return {
			initialCommand: plan.initialCommand,
			usedFormalAgentLaunch: false,
		};
	}

	try {
		await launchAgent({
			terminalId: plan.terminalId,
			agent: plan.agentName,
		});
		return {
			initialCommand: undefined,
			usedFormalAgentLaunch: true,
		};
	} catch (error) {
		console.warn(
			`Host agent launch failed for ${plan.agentName}; falling back to its terminal command`,
			error,
		);
		return {
			initialCommand: plan.fallbackCommand,
			usedFormalAgentLaunch: false,
		};
	}
}
