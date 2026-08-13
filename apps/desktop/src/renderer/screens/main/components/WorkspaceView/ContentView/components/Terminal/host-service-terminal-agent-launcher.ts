/**
 * Terminal agent launcher for the fused v1/host-service backend (Milestone 4).
 *
 * Launches through the host-service agent router so command construction,
 * managed wrappers, environment overlays, and lifecycle binding all stay on
 * the host side.
 *
 * See: plans/done/20260724-v1-v2-terminal-fusion.md (Milestone 4)
 */
import type { AppRouter } from "@superset/host-service";
import type { TRPCClient } from "@trpc/client";

export interface LaunchTerminalAgentOptions {
	client: TRPCClient<AppRouter>;
	workspaceId: string;
	paneId: string;
	agent: string;
	prompt: string;
	model?: string;
	effort?: string;
}

export interface LaunchTerminalAgentResult {
	terminalId: string;
	label: string;
}

/**
 * The v1 pane id is deliberately also the backend terminal id. The existing
 * pane adapter can therefore idempotently adopt the session regardless of
 * whether React mounts before or after this mutation resolves.
 */
export async function launchTerminalAgent(
	options: LaunchTerminalAgentOptions,
): Promise<LaunchTerminalAgentResult> {
	const result = await options.client.agents.run.mutate({
		workspaceId: options.workspaceId,
		agent: options.agent,
		prompt: options.prompt,
		terminalId: options.paneId,
		model: options.model,
		effort: options.effort,
	});
	if (result.kind !== "terminal") {
		throw new Error(`Agent ${options.agent} did not launch in a terminal`);
	}
	if (result.sessionId !== options.paneId) {
		throw new Error(
			`Host launched unexpected terminal ${result.sessionId} for pane ${options.paneId}`,
		);
	}
	return { terminalId: result.sessionId, label: result.label };
}
