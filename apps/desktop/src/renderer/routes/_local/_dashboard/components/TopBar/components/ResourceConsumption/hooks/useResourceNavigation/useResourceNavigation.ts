import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { findPanesStoreByPaneId } from "renderer/lib/panes";
import { navigateToWorkspace as navigateToWorkspaceRoute } from "renderer/routes/_local/_dashboard/utils/workspace-navigation";
import type { SessionMetrics } from "../../types";

export function useResourceNavigation({
	onNavigate,
}: {
	onNavigate: () => void;
}) {
	const navigate = useNavigate();
	const getPaneName = useCallback((session: SessionMetrics) => {
		const located = findPanesStoreByPaneId(session.paneId);
		const pane = located?.store.getState().getPane(session.paneId)?.pane;
		return (
			session.title ??
			pane?.titleOverride ??
			`Terminal ${session.sessionId.slice(0, 8)}`
		);
	}, []);
	const navigateToWorkspace = useCallback(
		(workspaceId: string) => {
			void navigateToWorkspaceRoute(workspaceId, navigate);
			onNavigate();
		},
		[navigate, onNavigate],
	);
	const navigateToPane = useCallback(
		(workspaceId: string, paneId: string) => {
			void navigateToWorkspaceRoute(workspaceId, navigate, {
				search: { terminalId: paneId, focusRequestId: crypto.randomUUID() },
			});
			onNavigate();
		},
		[navigate, onNavigate],
	);
	return { getPaneName, navigateToWorkspace, navigateToPane };
}
