import type { WorkspaceStore } from "@superset/panes";
import type { HarnessKind } from "@superset/session-protocol";
import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { createDesktopAcpSessionClient } from "renderer/lib/acp-session-client";
import type { AcpAgentDefinitionId } from "renderer/lib/acp-session-launch";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { StoreApi } from "zustand/vanilla";
import { openAcpSessionInPanesStore } from "./openAcpSessionInPanesStore";
import type { PanesPaneData } from "./types";

/**
 * Route API for the v1-shell workspace route. Used by `PanesWorkspace`
 * (a screen component, not the route component) to read the typed search
 * params without importing the `Route` object — which would form a circular
 * import (page.tsx → WorkspaceLayout → ContentView → PanesWorkspace).
 */
const workspaceRoute = getRouteApi(
	"/_local/_dashboard/workspace/$workspaceId/",
);

const ACP_AGENT_BY_HARNESS = {
	"claude-agent-acp": "claude",
	"codex-app-server": "codex",
	"pi-acp": "pi",
	"myflicker-acp": "myflicker",
} as const satisfies Record<HarnessKind, AcpAgentDefinitionId>;

interface TerminalPaneLocation {
	tabId: string;
	paneId: string;
}

/** Scan the panes state for the tab/pane hosting `terminalId`. */
function findTerminalPaneLocation(
	state: WorkspaceStore<PanesPaneData>,
	terminalId: string,
): TerminalPaneLocation | null {
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "terminal") continue;
			if (pane.data.terminalId !== terminalId) continue;
			return { tabId: tab.id, paneId: pane.id };
		}
	}
	return null;
}

/** Focus the pane hosting `terminalId`; returns false when none matches. */
function focusTerminalPane(
	store: StoreApi<WorkspaceStore<PanesPaneData>>,
	terminalId: string,
): boolean {
	const state = store.getState();
	const location = findTerminalPaneLocation(state, terminalId);
	if (!location) return false;
	state.setActiveTab(location.tabId);
	state.setActivePane(location);
	return true;
}

/** Focus the pane hosting `terminalId`, or add a new terminal tab for it. */
function focusOrAddTerminalPane(
	store: StoreApi<WorkspaceStore<PanesPaneData>>,
	terminalId: string,
): void {
	if (focusTerminalPane(store, terminalId)) return;
	store.getState().addTab({
		panes: [{ kind: "terminal", data: { terminalId } }],
	});
}

/** Open `url` as a webview pane - removed with internal browser feature. */
function openUrlInWorkspace(
	_store: StoreApi<WorkspaceStore<PanesPaneData>>,
	_target: "current-tab" | "new-tab",
	_url: string,
): void {
	// Browser feature removed
}

/**
 * Consume deep-link search params (`terminalId`, `openUrl`, …) that the
 * v1-shell workspace route accepts (see `validateSearch` in `page.tsx`).
 * Each param drives a panes-engine side effect:
 *
 * - `terminalId` or `acpSessionId` (+ optional `focusRequestId`): focus or add
 *   the pane for an existing session. Ownership is verified against the fused
 *   host-service backend before focusing, so a cross-workspace link is rejected.
 * - `openUrl` (+ optional `openUrlTarget` / `openUrlRequestId`): open the
 *   URL as a webview pane in the current or a new tab.
 *
 * Only active when the panes engine owns the view.
 * Each unique (id, focusRequestId) / (target, url, requestId) tuple is
 * consumed once so a URL persisting across reloads does not re-fire.
 */
export function usePanesDeepLinkConsumer({
	store,
	hostUrl,
	hostWorkspaceId,
}: {
	store: StoreApi<WorkspaceStore<PanesPaneData>>;
	hostUrl: string | null;
	hostWorkspaceId: string | null;
}): void {
	const {
		terminalId,
		acpSessionId,
		focusRequestId,
		openUrl,
		openUrlTarget,
		openUrlRequestId,
	} = workspaceRoute.useSearch();

	const consumedTerminalRef = useRef<Set<string>>(new Set());
	const consumedAcpRef = useRef<Set<string>>(new Set());
	const consumedUrlRef = useRef<Set<string>>(new Set());

	// Verify the terminal session belongs to this workspace before focusing.
	// `enabled` gates the query so we only fetch when a terminal deep link is
	// actually present.
	useEffect(() => {
		if (!terminalId || !hostUrl || !hostWorkspaceId) return;
		const key = terminalFocusConsumeKey(terminalId, focusRequestId);
		if (consumedTerminalRef.current.has(key)) return;
		void getHostServiceClientByUrl(hostUrl)
			.terminal.listSessions.query({ workspaceId: hostWorkspaceId })
			.then(({ sessions }) => {
				if (consumedTerminalRef.current.has(key)) return;
				if (!sessions.some((session) => session.terminalId === terminalId))
					return;
				consumedTerminalRef.current.add(key);
				focusOrAddTerminalPane(store, terminalId);
			})
			.catch((error) =>
				console.warn("[deep-link] Terminal session open failed", error),
			);
	}, [store, terminalId, focusRequestId, hostUrl, hostWorkspaceId]);

	useEffect(() => {
		if (!acpSessionId || !hostUrl) return;
		const key = acpSessionConsumeKey(acpSessionId, focusRequestId);
		if (consumedAcpRef.current.has(key)) return;
		void createDesktopAcpSessionClient(hostUrl)
			.api.get({ sessionId: acpSessionId })
			.then((session) => {
				if (session.workspaceId !== hostWorkspaceId) return;
				consumedAcpRef.current.add(key);
				const agentDefinitionId = ACP_AGENT_BY_HARNESS[session.harness];
				openAcpSessionInPanesStore(store, {
					sessionId: acpSessionId,
					agentDefinitionId,
					title: session.title,
					status: session.status,
				});
			})
			.catch((error) =>
				console.warn("[deep-link] ACP session open failed", error),
			);
	}, [acpSessionId, focusRequestId, hostUrl, hostWorkspaceId, store]);

	useEffect(() => {
		if (!openUrl) return;
		const target = openUrlTarget ?? "current-tab";
		const key = openUrlConsumeKey(openUrl, target, openUrlRequestId);
		if (consumedUrlRef.current.has(key)) return;
		consumedUrlRef.current.add(key);
		openUrlInWorkspace(store, target, openUrl);
	}, [store, openUrl, openUrlTarget, openUrlRequestId]);
}

function acpSessionConsumeKey(
	sessionId: string,
	focusRequestId: string | undefined,
): string {
	return focusRequestId
		? `acp:${sessionId}:focus:${focusRequestId}`
		: `acp:${sessionId}`;
}

function terminalFocusConsumeKey(
	terminalId: string,
	focusRequestId: string | undefined,
): string {
	return focusRequestId
		? `terminal:${terminalId}:focus:${focusRequestId}`
		: `terminal:${terminalId}`;
}

function openUrlConsumeKey(
	url: string,
	target: "current-tab" | "new-tab",
	requestId: string | undefined,
): string {
	return requestId
		? `${target}:${url}:request:${requestId}`
		: `${target}:${url}`;
}
