import type { SessionScopedState } from "@superset/session-protocol";
import {
	ACP_AGENT_HARNESS_BY_AGENT_ID,
	type AcpSupportedAgentId,
} from "@superset/shared/agent-catalog";
import type { DesktopAcpSessionClient } from "../acp-session-client";

/**
 * Runtime set of agent definition ids that ACP knows how to launch. Kept in
 * lockstep with the `harness` table below via the type constraint.
 */
export const ACP_SUPPORTED_AGENT_IDS = Object.keys(
	ACP_AGENT_HARNESS_BY_AGENT_ID,
) as AcpSupportedAgentId[];

export type AcpAgentDefinitionId = AcpSupportedAgentId;

export function isAcpSupportedAgentId(
	value: string,
): value is AcpAgentDefinitionId {
	return (ACP_SUPPORTED_AGENT_IDS as readonly string[]).includes(value);
}

export interface LaunchAcpSessionInput {
	workspaceId: string;
	agentDefinitionId: AcpAgentDefinitionId;
	client: DesktopAcpSessionClient;
	/**
	 * Optional model id the user picked for this agent preset. Forwarded to
	 * the host so the adapter can apply it after `session/new` — has no
	 * effect when the harness exposes no `model` config option.
	 */
	model?: string;
	openPane(input: {
		sessionId: string;
		agentDefinitionId: AcpAgentDefinitionId;
		title: string | null;
		status: "starting";
		isLaunching: true;
	}): void;
	onSessionCreated?(input: {
		sessionId: string;
		title: string | null;
		status: SessionScopedState["status"];
	}): void;
	onSessionCreationFailed?(input: { sessionId: string; error: Error }): void;
	sessionId?: string;
}

export interface LaunchAcpSessionResult {
	sessionId: string;
	state: SessionScopedState;
}

export async function launchAcpSession(
	input: LaunchAcpSessionInput,
): Promise<LaunchAcpSessionResult> {
	const {
		workspaceId,
		agentDefinitionId,
		client,
		openPane,
		onSessionCreated,
		onSessionCreationFailed,
	} = input;

	const selectedHarness = ACP_AGENT_HARNESS_BY_AGENT_ID[agentDefinitionId] as
		| SessionScopedState["harness"]
		| undefined;
	if (!selectedHarness) {
		throw new Error(
			`Unsupported ACP agentDefinitionId: "${agentDefinitionId}".`,
		);
	}

	const sessionId = input.sessionId ?? crypto.randomUUID();
	// The host may need several seconds to cold-start an ACP adapter. Open the
	// stable, caller-generated id before awaiting it so the user gets a focused
	// starting tab immediately and the mounted session hook can poll for it.
	openPane({
		sessionId,
		agentDefinitionId,
		title: null,
		status: "starting",
		isLaunching: true,
	});

	try {
		const state = await client.create({
			sessionId,
			workspaceId,
			harness: selectedHarness,
			...(input.model ? { model: input.model } : {}),
		});

		const confirmedId = state.sessionId;
		onSessionCreated?.({
			sessionId: confirmedId,
			title: state.title,
			status: state.status,
		});

		return { sessionId: confirmedId, state };
	} catch (cause) {
		const error = cause instanceof Error ? cause : new Error(String(cause));
		onSessionCreationFailed?.({ sessionId, error });
		throw error;
	}
}
