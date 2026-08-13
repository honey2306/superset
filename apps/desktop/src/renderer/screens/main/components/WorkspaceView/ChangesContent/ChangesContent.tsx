import { useParams } from "@tanstack/react-router";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useCatalogWorkspace } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { useGitChangesStatus } from "renderer/screens/main/hooks/useGitChangesStatus";
import {
	RightSidebarTab,
	useSidebarStore,
} from "renderer/stores/sidebar-state";
import { InfiniteScrollView } from "./components/InfiniteScrollView";

export function ChangesContent() {
	const { t } = useTranslation();
	const { workspaceId } = useParams({ strict: false });
	const isChangesSidebarVisible = useSidebarStore(
		(s) => s.isSidebarOpen && s.rightSidebarTab === RightSidebarTab.Changes,
	);
	const { workspace } = useCatalogWorkspace(workspaceId);
	const worktreePath = workspace?.worktreePath;

	const { status, isLoading, effectiveBaseBranch } = useGitChangesStatus({
		workspaceId,
		worktreePath,
		refetchInterval: isChangesSidebarVisible ? undefined : 2500,
		refetchOnWindowFocus: !isChangesSidebarVisible,
	});

	if (!workspaceId || !worktreePath) {
		return (
			<div className="h-full flex items-center justify-center text-fg-mute">
				{t("changes.noWorkspaceSelected")}
			</div>
		);
	}

	if (!status && isLoading) {
		return (
			<div className="h-full flex items-center justify-center text-fg-mute">
				{t("changes.loadingChanges")}
			</div>
		);
	}

	if (!status) {
		return (
			<div className="h-full flex select-text cursor-text items-center justify-center text-fg-mute">
				{t("changes.unableToLoad")}
			</div>
		);
	}

	return (
		<div className="h-full overflow-hidden">
			<InfiniteScrollView
				status={status}
				workspaceId={workspaceId}
				worktreePath={worktreePath}
				baseBranch={effectiveBaseBranch}
			/>
		</div>
	);
}
