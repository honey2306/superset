import type { WorkspaceStore } from "@superset/panes";
import type { HarnessKind } from "@superset/session-protocol";
import type { AcpTerminalOpenRequestedPayload } from "@superset/workspace-client";
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
	sessionId?: string;
	terminalId?: string;
	requestId?: string;
	occurredAt: number;
}

export const MAX_HANDLED_ACP_SESSION_OPEN_REQUESTS = 256;

export function openTerminalFromAcpRequest(
	store: StoreApi<WorkspaceStore<PanesPaneData>>,
	event: AcpTerminalOpenRequestedPayload,
): void {
	const state = store.getState();
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "terminal" || pane.data.terminalId !== event.terminalId)
				continue;
			if (event.title) {
				state.setPaneTitleOverride({
					tabId: tab.id,
					paneId: pane.id,
					titleOverride: event.title,
				});
			}
			if (event.focus) {
				state.setActiveTab(tab.id);
				state.setActivePane({ tabId: tab.id, paneId: pane.id });
			}
			return;
		}
	}
	state.addTab({
		titleOverride: event.title,
		panes: [
			{
				kind: "terminal",
				titleOverride: event.title,
				data: { terminalId: event.terminalId },
			},
		],
	});
	if (!event.focus) {
		const nextState = store.getState();
		const createdTab = nextState.tabs.at(-1);
		const previousTab = state.activeTabId;
		if (createdTab && previousTab) nextState.setActiveTab(previousTab);
	}
}

/**
 * Keep transport duplicates idempotent without suppressing a later explicit
 * request to reopen the same session. Older daemons do not send requestId, so
 * their timestamp remains the best available request identity.
 */
export function shouldHandleAcpSessionOpenRequest(
	handled: Set<string>,
	event: AcpSessionOpenRequestIdentity,
): boolean {
	const key =
		event.requestId ??
		`${event.sessionId ?? event.terminalId ?? "unknown"}:${event.occurredAt}`;
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
		const offTerminal = bus.on(
			"acp-terminal:open-requested",
			hostWorkspaceId,
			(_workspaceId, event) => {
				if (!shouldHandleAcpSessionOpenRequest(handled.current, event)) return;
				openTerminalFromAcpRequest(store, event);
			},
		);
		const release = bus.retain();
		return () => {
			off();
			offTerminal();
			release();
		};
	}, [hostUrl, hostWorkspaceId, store]);
}
