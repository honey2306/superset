import type { WorkspaceStore } from "@superset/panes";
import type { HarnessKind } from "@superset/session-protocol";
import { getEventBus } from "@superset/workspace-client";
import { useEffect, useRef } from "react";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import type { StoreApi } from "zustand/vanilla";
import { openAcpSessionInPanesStore } from "./openAcpSessionInPanesStore";
import type { V1PanesPaneData } from "./types";

const AGENT_BY_HARNESS = {
	"claude-agent-acp": "claude",
	"codex-app-server": "codex",
	"pi-acp": "pi",
	"myflicker-acp": "myflicker",
} as const satisfies Record<
	HarnessKind,
	"claude" | "codex" | "pi" | "myflicker"
>;

/** Opens best-effort presentation requests emitted by Superset ACP tools. */
export function useAcpSessionOpenRequests({
	store,
	hostUrl,
	hostWorkspaceId,
}: {
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>;
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
				if (handled.current.has(event.sessionId)) return;
				handled.current.add(event.sessionId);
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
