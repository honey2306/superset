import type { ExternalApp } from "@superset/shared/desktop-types";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { openFileInPanes } from "renderer/lib/panes";
import type { WorkspaceSearchParams } from "renderer/routes/_local/_dashboard/utils/workspace-navigation";
import { navigateToWorkspace } from "renderer/routes/_local/_dashboard/utils/workspace-navigation";
import { supportsWorkspaceChanges } from "renderer/routes/_local/_dashboard/workspace/$workspaceId/utils/supportsWorkspaceChanges";
import { WorkspaceLoadingState } from "renderer/routes/_local/_dashboard/workspace/components/WorkspaceLoadingState";
import { useProjectDefaultApp } from "renderer/routes/_local/hooks/useProjectDefaultApp";
import type { WorkspaceProjection } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import {
	useCatalogProject,
	useCatalogWorkspace,
	useCatalogWorkspaceNeighbours,
} from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { NotFound } from "renderer/routes/not-found";
import { CommandPalette } from "renderer/screens/main/components/CommandPalette";
import { useWorkspaceFileEventBridge } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents";
import { useWorkspaceRenameReconciliation } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceRenameReconciliation";
import { WorkspaceLayout } from "renderer/screens/main/components/WorkspaceView/WorkspaceLayout";
import { WorkspaceProvisioningOperationView } from "renderer/screens/main/components/WorkspaceView/WorkspaceProvisioningOperationView";
import { useCreateOrOpenPR, usePRStatus } from "renderer/screens/main/hooks";
import { SidebarMode, useSidebarStore } from "renderer/stores/sidebar-state";
import {
	useWorkspaceLaunch,
	useWorkspaceProvisioningAdapter,
} from "renderer/stores/workspace-launch";

export const Route = createFileRoute(
	"/_local/_dashboard/workspace/$workspaceId/",
)({
	component: WorkspacePage,
	notFoundComponent: NotFound,
	validateSearch: (search: Record<string, unknown>): WorkspaceSearchParams => ({
		tabId: typeof search.tabId === "string" ? search.tabId : undefined,
		paneId: typeof search.paneId === "string" ? search.paneId : undefined,
		terminalId:
			typeof search.terminalId === "string" && search.terminalId.length > 0
				? search.terminalId
				: undefined,
		acpSessionId:
			typeof search.acpSessionId === "string" && search.acpSessionId.length > 0
				? search.acpSessionId
				: undefined,
		focusRequestId:
			typeof search.focusRequestId === "string" &&
			search.focusRequestId.length > 0
				? search.focusRequestId
				: undefined,
		openUrl:
			typeof search.openUrl === "string" && search.openUrl.length > 0
				? search.openUrl
				: undefined,
		openUrlTarget:
			search.openUrlTarget === "current-tab" ||
			search.openUrlTarget === "new-tab"
				? search.openUrlTarget
				: undefined,
		openUrlRequestId:
			typeof search.openUrlRequestId === "string" &&
			search.openUrlRequestId.length > 0
				? search.openUrlRequestId
				: undefined,
	}),
});

function WorkspacePage() {
	const { workspaceId } = Route.useParams();
	const { workspace, isReady } = useCatalogWorkspace(workspaceId);

	if (!workspace && !isReady) {
		return <WorkspaceLoadingState />;
	}

	if (!workspace) return <NotFound />;

	return (
		<WorkspacePageContent workspaceId={workspaceId} workspace={workspace} />
	);
}

function WorkspacePageContent({
	workspaceId,
	workspace,
}: {
	workspaceId: string;
	workspace: WorkspaceProjection;
}) {
	useWorkspaceFileEventBridge(
		workspaceId,
		workspace?.worktreePath,
		Boolean(workspace?.worktreePath),
	);
	useWorkspaceRenameReconciliation({
		workspaceId,
		worktreePath: workspace?.worktreePath,
		enabled: Boolean(workspace?.worktreePath),
	});
	const { project } = useCatalogProject(workspace.projectId);
	const supportsChanges = supportsWorkspaceChanges({
		worktreePath: workspace.worktreePath,
		project,
	});
	const navigate = useNavigate();
	const provisioningAdapter = useWorkspaceProvisioningAdapter();
	const workspaceLaunch = useWorkspaceLaunch(provisioningAdapter);
	const provisioningOperation = workspaceLaunch.forWorkspace(workspaceId);
	const [isRetryingProvisioning, setIsRetryingProvisioning] = useState(false);

	// A Catalog workspace is routable as soon as materialization commits. Keep
	// showing the operation view only for that committed workspace while its
	// required runtime is starting or retrying.
	const showProvisioningView =
		provisioningOperation?.workspaceId === workspaceId &&
		(provisioningOperation.state === "queued" ||
			provisioningOperation.state === "running" ||
			provisioningOperation.state === "failed");
	const retryProvisioning = useCallback(() => {
		if (!provisioningAdapter || !provisioningOperation) return;
		setIsRetryingProvisioning(true);
		void workspaceLaunch
			.retry(provisioningAdapter, provisioningOperation.id)
			.catch((error) => {
				console.error("[WorkspacePage] Failed to retry provisioning:", error);
			})
			.finally(() => setIsRetryingProvisioning(false));
	}, [provisioningAdapter, provisioningOperation, workspaceLaunch]);

	// Open in last used app shortcut
	const projectId = workspace?.projectId;
	const { app: defaultApp, setApp: persistDefaultApp } =
		useProjectDefaultApp(projectId);
	const resolvedDefaultApp: ExternalApp = defaultApp ?? "cursor";
	const { mutate: mutateOpenInApp } =
		electronTrpc.external.openInApp.useMutation({
			onSuccess: (_data, variables) => persistDefaultApp(variables.app),
		});
	const handleOpenInApp = useCallback(() => {
		if (workspace?.worktreePath) {
			mutateOpenInApp({
				path: workspace.worktreePath,
				app: resolvedDefaultApp,
			});
		}
	}, [workspace?.worktreePath, resolvedDefaultApp, mutateOpenInApp]);

	// Copy path shortcut
	const { copyToClipboard } = useCopyToClipboard();
	useHotkey("COPY_PATH", () => {
		if (workspace?.worktreePath) {
			copyToClipboard(workspace.worktreePath);
		}
	});

	// Open PR shortcut (⌘⇧P)
	const { pr } = usePRStatus({ workspaceId, surface: "workspace-page" });
	const { createOrOpenPR } = useCreateOrOpenPR({ workspaceId });
	useHotkey("OPEN_PR", () => {
		if (pr?.url) {
			window.open(pr.url, "_blank");
		} else {
			createOrOpenPR();
		}
	});

	const toggleSidebar = useSidebarStore((state) => state.toggleSidebar);
	const isSidebarOpen = useSidebarStore((state) => state.isSidebarOpen);
	const setSidebarOpen = useSidebarStore((state) => state.setSidebarOpen);
	const currentSidebarMode = useSidebarStore((state) => state.currentMode);
	const setSidebarMode = useSidebarStore((state) => state.setMode);

	const [quickOpenOpen, setQuickOpenOpen] = useState(false);
	const handleQuickOpen = useCallback(() => setQuickOpenOpen(true), []);
	useHotkey("QUICK_OPEN", handleQuickOpen);

	// Toggle changes sidebar (⌘L)
	useHotkey("TOGGLE_SIDEBAR", () => toggleSidebar());

	// Open diff viewer (⌘⇧L)
	useHotkey("OPEN_DIFF_VIEWER", () => {
		if (!supportsChanges) return;
		if (!isSidebarOpen) {
			setSidebarOpen(true);
			setSidebarMode(SidebarMode.Changes);
		} else {
			const isExpanded = currentSidebarMode === SidebarMode.Changes;
			setSidebarMode(isExpanded ? SidebarMode.Tabs : SidebarMode.Changes);
		}
	});

	const { previous: previousWorkspace, next: nextWorkspace } =
		useCatalogWorkspaceNeighbours(workspaceId);
	useHotkey("PREV_WORKSPACE", () => {
		const prevWorkspaceId = previousWorkspace?.id;
		if (prevWorkspaceId) {
			navigateToWorkspace(prevWorkspaceId, navigate);
		}
	});

	useHotkey("NEXT_WORKSPACE", () => {
		const nextWorkspaceId = nextWorkspace?.id;
		if (nextWorkspaceId) {
			navigateToWorkspace(nextWorkspaceId, navigate);
		}
	});

	return (
		<div className="flex-1 h-full flex flex-col overflow-hidden">
			<div className="flex-1 min-h-0 flex overflow-hidden">
				{showProvisioningView && provisioningOperation ? (
					<WorkspaceProvisioningOperationView
						workspaceId={workspaceId}
						workspaceName={workspace.name}
						operation={provisioningOperation}
						onRetry={retryProvisioning}
						isRetrying={isRetryingProvisioning}
					/>
				) : (
					<WorkspaceLayout
						supportsChanges={supportsChanges}
						defaultExternalApp={resolvedDefaultApp}
						onOpenInApp={handleOpenInApp}
						onOpenQuickOpen={handleQuickOpen}
					/>
				)}
			</div>
			<CommandPalette
				workspaceId={workspaceId}
				open={quickOpenOpen}
				onOpenChange={setQuickOpenOpen}
				onSelectFile={(filePath) => openFileInPanes(workspaceId, { filePath })}
			/>
		</div>
	);
}
