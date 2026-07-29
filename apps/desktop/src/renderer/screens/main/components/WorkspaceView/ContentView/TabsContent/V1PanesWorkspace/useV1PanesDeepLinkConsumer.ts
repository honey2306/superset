import type { WorkspaceStore } from "@superset/panes";
import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { StoreApi } from "zustand/vanilla";
import type { V1PanesPaneData } from "./types";
import { createBrowserState } from "./useV1PanesWorkspace";

/**
 * Route API for the v1-shell workspace route. Used by `V1PanesWorkspace`
 * (a screen component, not the route component) to read the typed search
 * params without importing the `Route` object — which would form a circular
 * import (page.tsx → WorkspaceLayout → ContentView → V1PanesWorkspace).
 */
const workspaceRoute = getRouteApi(
	"/_authenticated/_dashboard/workspace/$workspaceId/",
);

interface TerminalPaneLocation {
	tabId: string;
	paneId: string;
}

/** Scan the panes state for the tab/pane hosting `terminalId`. */
function findTerminalPaneLocation(
	state: WorkspaceStore<V1PanesPaneData>,
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
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>,
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
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>,
	terminalId: string,
): void {
	if (focusTerminalPane(store, terminalId)) return;
	store.getState().addTab({
		panes: [{ kind: "terminal", data: { terminalId } }],
	});
}

/** Open `url` as a webview pane in the current or a new tab. */
function openUrlInWorkspace(
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>,
	target: "current-tab" | "new-tab",
	url: string,
): void {
	const pane = {
		kind: "webview",
		data: { browser: createBrowserState(url) },
	};
	const state = store.getState();
	if (target === "new-tab") {
		state.addTab({ panes: [pane] });
		return;
	}
	state.openPane({ pane });
}

/**
 * Consume deep-link search params (`terminalId`, `openUrl`, …) that the
 * v1-shell workspace route accepts (see `validateSearch` in `page.tsx`).
 * Each param drives a panes-engine side effect:
 *
 * - `terminalId` (+ optional `focusRequestId`): focus or add the terminal
 *   pane for an already-running session (automation-run links, notification
 *   focus requests). Ownership is verified against the fused host-service
 *   backend before focusing, so a cross-workspace link is rejected.
 * - `openUrl` (+ optional `openUrlTarget` / `openUrlRequestId`): open the
 *   URL as a webview pane in the current or a new tab.
 *
 * Only active when the panes engine owns the view (`V2_PANES_IN_V1` flag on).
 * Each unique (id, focusRequestId) / (target, url, requestId) tuple is
 * consumed once so a URL persisting across reloads does not re-fire.
 */
export function useV1PanesDeepLinkConsumer({
	store,
	workspaceId,
}: {
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>;
	workspaceId: string;
}): void {
	const {
		terminalId,
		focusRequestId,
		openUrl,
		openUrlTarget,
		openUrlRequestId,
	} = workspaceRoute.useSearch();

	const consumedTerminalRef = useRef<Set<string>>(new Set());
	const consumedUrlRef = useRef<Set<string>>(new Set());

	// Verify the terminal session belongs to this workspace before focusing.
	// `enabled` gates the query so we only fetch when a terminal deep link is
	// actually present.
	const terminalSessionsQuery =
		electronTrpc.terminal.listSessionsForWorkspace.useQuery(
			{ workspaceId },
			{
				enabled: terminalId != null,
				refetchOnWindowFocus: false,
			},
		);

	useEffect(() => {
		if (!terminalId) return;
		if (!terminalSessionsQuery.isSuccess) return;
		const key = terminalFocusConsumeKey(terminalId, focusRequestId);
		if (consumedTerminalRef.current.has(key)) return;
		consumedTerminalRef.current.add(key);
		const owned = terminalSessionsQuery.data.sessions.some(
			(session) => session.sessionId === terminalId,
		);
		if (!owned) {
			console.warn(
				"[deep-link] Ignoring terminal link for a session not in this workspace",
				{ terminalId, workspaceId },
			);
			return;
		}
		focusOrAddTerminalPane(store, terminalId);
	}, [
		store,
		terminalId,
		focusRequestId,
		terminalSessionsQuery.isSuccess,
		terminalSessionsQuery.data,
		workspaceId,
	]);

	useEffect(() => {
		if (!openUrl) return;
		const target = openUrlTarget ?? "current-tab";
		const key = openUrlConsumeKey(openUrl, target, openUrlRequestId);
		if (consumedUrlRef.current.has(key)) return;
		consumedUrlRef.current.add(key);
		openUrlInWorkspace(store, target, openUrl);
	}, [store, openUrl, openUrlTarget, openUrlRequestId]);
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
