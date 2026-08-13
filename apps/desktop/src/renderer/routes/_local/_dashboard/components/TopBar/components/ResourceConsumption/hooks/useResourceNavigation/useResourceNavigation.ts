import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { navigateToWorkspace as navigateToWorkspaceRoute } from "renderer/routes/_local/_dashboard/utils/workspace-navigation";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { SessionMetrics } from "../../types";

export function useResourceNavigation({
	onNavigate,
}: {
	onNavigate: () => void;
}) {
	const navigate = useNavigate();
	const panes = useTabsStore((state) => state.panes);
	const getPaneName = useCallback(
		(session: SessionMetrics) =>
			session.title ??
			panes[session.paneId]?.name ??
			`Terminal ${session.sessionId.slice(0, 8)}`,
		[panes],
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
			void navigateToWorkspaceRoute(workspaceId, navigate, {
				search: { terminalId: paneId, focusRequestId: crypto.randomUUID() },
			});
			onNavigate();
		},
		[navigate, onNavigate],
	);
	return { getPaneName, navigateToWorkspace, navigateToPane };
}
