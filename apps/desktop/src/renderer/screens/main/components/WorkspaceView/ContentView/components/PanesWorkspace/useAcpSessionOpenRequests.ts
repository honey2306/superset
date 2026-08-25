import type { WorkspaceStore } from "@superset/panes";
import type { HarnessKind } from "@superset/session-protocol";
import { getEventBus } from "@superset/workspace-client";
import { useEffect, useRef } from "react";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import type { StoreApi } from "zustand/vanilla";
import { openAcpSessionInPanesStore } from "./openAcpSessionInPanesStore";
import type { PanesPaneData } from "./types";

const AGENT_BY_HARNESS = {
	"claude-agent-acp": "claude",
	"codex-app-server": "codex",
	"pi-acp": "pi",
	"myflicker-acp": "myflicker",
	"deepseek-acp": "deepseek",
} as const satisfies Record<
	HarnessKind,
	"claude" | "codex" | "pi" | "myflicker" | "deepseek"
>;

export interface AcpSessionOpenRequestIdentity {
	sessionId: string;
	requestId?: string;
	occurredAt: number;
}

export const MAX_HANDLED_ACP_SESSION_OPEN_REQUESTS = 256;

/**
 * Keep transport duplicates idempotent without suppressing a later explicit
 * request to reopen the same session. Older daemons do not send requestId, so
 * their timestamp remains the best available request identity.
 */
export function shouldHandleAcpSessionOpenRequest(
	handled: Set<string>,
	event: AcpSessionOpenRequestIdentity,
): boolean {
	const key = event.requestId ?? `${event.sessionId}:${event.occurredAt}`;
	if (handled.has(key)) return false;
	handled.add(key);
	while (handled.size > MAX_HANDLED_ACP_SESSION_OPEN_REQUESTS) {
		const oldest = handled.values().next().value;
		if (oldest === undefined) break;
		handled.delete(oldest);
	}
	return true;
}

/** Opens best-effort presentation requests emitted by Superset ACP tools. */
export function useAcpSessionOpenRequests({
	store,
	hostUrl,
	hostWorkspaceId,
}: {
	store: StoreApi<WorkspaceStore<PanesPaneData>>;
	hostUrl: string | null;
	hostWorkspaceId: string | null;
}): void {
	const handled = useRef(new Set<string>());

	useEffect(() => {
		if (!hostUrl || !hostWorkspaceId) return;
		const bus = getEventBus(hostUrl, () => getHostServiceWsToken(hostUrl));
		const off = bus.on(
			"acp-session:open-requested",
			hostWorkspaceId,
			(_workspaceId, event) => {
				if (!shouldHandleAcpSessionOpenRequest(handled.current, event)) return;
				openAcpSessionInPanesStore(store, {
					sessionId: event.sessionId,
					agentDefinitionId: AGENT_BY_HARNESS[event.harness],
					title: null,
					isLaunching: false,
				});
			},
		);
		const release = bus.retain();
		return () => {
			off();
			release();
		};
	}, [hostUrl, hostWorkspaceId, store]);
}
