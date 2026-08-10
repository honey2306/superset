import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { navigateToWorkspace as navigateToWorkspaceRoute } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { SessionMetrics } from "../../types";

export function useResourceNavigation({
	surface,
	onNavigate,
}: {
	surface: "v1" | "v2";
	onNavigate: () => void;
}) {
	const navigate = useNavigate();
	const panes = useTabsStore((state) => state.panes);
	const setActiveTab = useTabsStore((state) => state.setActiveTab);
	const setFocusedPane = useTabsStore((state) => state.setFocusedPane);
	const isV2 = surface === "v2";
	const getPaneName = useCallback(
		(session: SessionMetrics) => {
			if (isV2)
				return session.title ?? `Terminal ${session.sessionId.slice(0, 8)}`;
			return (
				panes[session.paneId]?.name || `Pane ${session.paneId.slice(0, 6)}`
			);
		},
		[isV2, panes],
	);
	const navigateToWorkspace = useCallback(
		(workspaceId: string) => {
			void navigateToWorkspaceRoute(workspaceId, navigate);
			onNavigate();
		},
		[navigate, onNavigate],
	);
	const navigateToPane = useCallback(
		(workspaceId: string, paneId: string) => {
			if (isV2) {
				void navigateToWorkspaceRoute(workspaceId, navigate, {
					search: { terminalId: paneId, focusRequestId: crypto.randomUUID() },
				});
				onNavigate();
				return;
			}
			const pane = panes[paneId];
			if (pane) {
				setActiveTab(workspaceId, pane.tabId);
				setFocusedPane(pane.tabId, paneId);
			}
			void navigateToWorkspaceRoute(workspaceId, navigate);
			onNavigate();
		},
		[isV2, navigate, onNavigate, panes, setActiveTab, setFocusedPane],
	);
	return { getPaneName, navigateToWorkspace, navigateToPane };
}
