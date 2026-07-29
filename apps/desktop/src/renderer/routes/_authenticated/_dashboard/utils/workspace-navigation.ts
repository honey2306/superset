import type {
	NavigateOptions,
	UseNavigateResult,
} from "@tanstack/react-router";

/**
 * Search params accepted by the v1-shell workspace route
 * (`/workspace/$workspaceId`). Combines the legacy tab/pane activation
 * params with the deep-link params the panes engine consumes
 * (terminal focus + open-URL requests from automation runs and
 * notifications) so the unified route can serve every entry point the
 * v2-workspace route used to handle.
 */
export interface WorkspaceSearchParams {
	tabId?: string;
	paneId?: string;
	terminalId?: string;
	focusRequestId?: string;
	openUrl?: string;
	openUrlTarget?: "current-tab" | "new-tab";
	openUrlRequestId?: string;
}

export interface V2WorkspaceSearchParams {
	terminalId?: string;
	focusRequestId?: string;
	openUrl?: string;
	openUrlTarget?: "current-tab" | "new-tab";
	openUrlRequestId?: string;
}

/**
 * Navigate to a workspace and update localStorage to remember it as the last viewed workspace.
 * This ensures the workspace will be restored when the app is reopened.
 *
 * @param workspaceId - The ID of the workspace to navigate to
 * @param navigate - The navigate function from useNavigate()
 * @param options - Optional navigation options (replace, resetScroll, etc.)
 */
export function navigateToWorkspace(
	workspaceId: string,
	navigate: UseNavigateResult<string>,
	options?: Omit<NavigateOptions, "to" | "params"> & {
		search?: WorkspaceSearchParams;
	},
): Promise<void> {
	const { search, ...rest } = options ?? {};
	localStorage.setItem("lastViewedWorkspaceId", workspaceId);
	return navigate({
		to: "/workspace/$workspaceId",
		params: { workspaceId },
		search: search ?? {},
		...rest,
	});
}

/**
 * Navigate to a V2 workspace route.
 */
export function navigateToV2Workspace(
	workspaceId: string,
	navigate: UseNavigateResult<string>,
	options?: Omit<NavigateOptions, "to" | "params" | "search"> & {
		search?: V2WorkspaceSearchParams;
	},
): Promise<void> {
	const { search, ...rest } = options ?? {};
	return navigate({
		to: "/v2-workspace/$workspaceId",
		params: { workspaceId },
		search: search ?? {},
		...rest,
	});
}
