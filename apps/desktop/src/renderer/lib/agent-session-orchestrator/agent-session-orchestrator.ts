import type {
	AgentLaunchRequest,
	AgentLaunchResult,
} from "@superset/shared/agent-launch";
import { normalizeAgentLaunchRequest } from "@superset/shared/agent-launch";
import {
	addTerminalPane,
	closePane,
	findPanesStoreByPaneId,
	findPanesStoreByTabId,
} from "renderer/lib/panes";
import { posthog } from "renderer/lib/posthog";
import { useAgentSessionLaunchStore } from "renderer/stores/agent-session-launch";
import { launchTerminalAdapter } from "./adapters/terminal-adapter";
import type {
	AgentLaunchTabsAdapter,
	AgentSessionLaunchAdapterKind,
	AgentSessionLaunchContext,
	QueueAgentSessionLaunchInput,
} from "./types";

const inFlightByIdempotency = new Map<string, Promise<AgentLaunchResult>>();
const settledByIdempotency = new Map<string, AgentLaunchResult>();

async function getDefaultTabsAdapter(): Promise<AgentLaunchTabsAdapter> {
	return {
		getPane: (paneId) => {
			const located = findPanesStoreByPaneId(paneId);
			const pane = located?.store.getState().getPane(paneId);
			return pane
				? { id: paneId, tabId: pane.tabId, type: pane.pane.kind }
				: undefined;
		},
		getTab: (tabId) => {
			const located = findPanesStoreByTabId(tabId);
			return located
				? { id: tabId, workspaceId: located.workspaceId }
				: undefined;
		},
		addTerminalTab: (workspaceId) => {
			const result = addTerminalPane(workspaceId);
			if (result.status !== "applied") {
				throw new Error(`Workspace ${workspaceId} panes are not mounted`);
			}
			return result.value;
		},
		addTerminalPane: (tabId) => {
			const located = findPanesStoreByTabId(tabId);
			if (!located) throw new Error(`Tab ${tabId} is not mounted`);
			const paneId = crypto.randomUUID();
			located.store.getState().addPane({
				tabId,
				pane: {
					id: paneId,
					kind: "terminal",
					data: { terminalId: paneId },
				},
			});
			return paneId;
		},
		removePane: (paneId) => {
			const located = findPanesStoreByPaneId(paneId);
			if (located) closePane(located.workspaceId, paneId);
		},
		setTabAutoTitle: (tabId, title) => {
			findPanesStoreByTabId(tabId)?.store.getState().setTabTitleOverride({
				tabId,
				titleOverride: title,
			});
		},
	};
}

function buildIdempotencyKey(request: AgentLaunchRequest): string | null {
	if (!request.idempotencyKey) {
		return null;
	}
	return `${request.workspaceId}:${request.idempotencyKey}`;
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error
		? error.message
		: "Failed to launch agent session";
}

function captureLaunchEvent({
	context,
	request,
	status,
	latencyMs,
	error,
}: {
	context: AgentSessionLaunchContext;
	request: AgentLaunchRequest;
	status: AgentLaunchResult["status"];
	latencyMs: number;
	error?: string;
}) {
	const capture =
		context.captureEvent ??
		(({
			event,
			properties,
		}: {
			event: "agent_session_launch";
			properties: Record<string, unknown>;
		}) => {
			posthog.capture(event, properties);
		});

	capture({
		event: "agent_session_launch",
		properties: {
			launch_source: request.source ?? context.source ?? "unknown",
			request_kind: request.kind,
			agent_type: request.agentType ?? null,
			result: status,
			latency_ms: latencyMs,
			failure_reason: error ?? null,
		},
	});
}

export function selectAgentLaunchAdapter(
	request: AgentLaunchRequest,
): AgentSessionLaunchAdapterKind {
	if (request.kind === "chat") {
		throw new Error(
			"Chat agent sessions are no longer available. Use a terminal agent instead.",
		);
	}
	return "terminal";
}

export async function launchAgentSession(
	requestInput: AgentLaunchRequest | unknown,
	context: AgentSessionLaunchContext,
): Promise<AgentLaunchResult> {
	const normalized = normalizeAgentLaunchRequest(requestInput);
	const request: AgentLaunchRequest = normalized.source
		? normalized
		: {
				...normalized,
				source: context.source,
			};

	const idempotencyKey = buildIdempotencyKey(request);
	if (idempotencyKey) {
		const settled = settledByIdempotency.get(idempotencyKey);
		if (settled) {
			return settled;
		}
		const inFlight = inFlightByIdempotency.get(idempotencyKey);
		if (inFlight) {
			return inFlight;
		}
	}

	const startedAt = Date.now();
	let phase: AgentLaunchResult["status"] = "queued";

	const run = (async () => {
		try {
			const tabs = context.tabs ?? (await getDefaultTabsAdapter());
			const executionContext: AgentSessionLaunchContext = {
				...context,
				tabs,
			};
			phase = "launching";
			if (request.kind === "chat") {
				throw new Error(
					"Chat agent sessions are no longer available. Use a terminal agent instead.",
				);
			}
			const payload = await launchTerminalAdapter(request, executionContext);
			phase = "running";
			const result: AgentLaunchResult = {
				workspaceId: request.workspaceId,
				tabId: payload.tabId ?? null,
				paneId: payload.paneId ?? null,
				sessionId: payload.sessionId ?? null,
				status: phase,
				error: null,
			};
			captureLaunchEvent({
				context: executionContext,
				request,
				status: result.status,
				latencyMs: Date.now() - startedAt,
			});
			return result;
		} catch (error) {
			const executionContext: AgentSessionLaunchContext = {
				...context,
			};
			phase = "failed";
			const errorMessage = toErrorMessage(error);
			const result: AgentLaunchResult = {
				workspaceId: request.workspaceId,
				tabId: null,
				paneId: null,
				sessionId: null,
				status: phase,
				error: errorMessage,
			};
			captureLaunchEvent({
				context: executionContext,
				request,
				status: result.status,
				latencyMs: Date.now() - startedAt,
				error: errorMessage,
			});
			return result;
		}
	})();

	if (idempotencyKey) {
		inFlightByIdempotency.set(idempotencyKey, run);
	}

	const result = await run;

	if (idempotencyKey) {
		inFlightByIdempotency.delete(idempotencyKey);
		settledByIdempotency.set(idempotencyKey, result);
	}

	return result;
}

export function queueAgentSessionLaunch(
	input: QueueAgentSessionLaunchInput,
): AgentLaunchResult {
	const request = normalizeAgentLaunchRequest(input.request);
	const store = useAgentSessionLaunchStore.getState();
	const existing = store.pendingTerminalSetups[request.workspaceId];
	const projectId = input.projectId ?? existing?.projectId;

	if (!projectId) {
		return {
			workspaceId: request.workspaceId,
			tabId: null,
			paneId: null,
			sessionId: null,
			status: "failed",
			error: `Project ID is required to queue launch for workspace ${request.workspaceId}`,
		};
	}

	store.addPendingTerminalSetup({
		workspaceId: request.workspaceId,
		projectId,
		initialCommands: existing?.initialCommands ?? input.initialCommands ?? null,
		defaultPresets: existing?.defaultPresets ?? input.defaultPresets,
		agentCommand: existing?.agentCommand,
		agentLaunchRequest: request,
	});

	return {
		workspaceId: request.workspaceId,
		tabId: null,
		paneId: null,
		sessionId: null,
		status: "queued",
		error: null,
	};
}
