import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useHighestAcpSessionStatusAtHost } from "renderer/hooks/host-service/useAcpSessionStatuses";
import {
	useClearWorkspaceTerminalStatusesAtHost,
	useMarkWorkspaceTerminalsSeenAtHost,
} from "renderer/hooks/host-service/useNotificationStatus";
import { useHighestTerminalAgentStatusAtHost } from "renderer/hooks/host-service/useTerminalAgentStatuses";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useHoverGitHubStatus } from "renderer/lib/githubQueryPolicy";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	clearWorkspacePaneStatuses,
	usePanesWorkspaceState,
} from "renderer/lib/panes";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useWorkspaceDeleteHandler } from "renderer/react-query/workspaces";
import { navigateToWorkspace } from "renderer/routes/_local/_dashboard/utils/workspace-navigation";
import { useDashboardSidebarState } from "renderer/routes/_local/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { WorkspaceRunIndicator } from "renderer/screens/main/components/WorkspaceRunIndicator";
import { useBranchSyncInvalidation } from "renderer/screens/main/hooks/useBranchSyncInvalidation";
import { useGitChangesStatus } from "renderer/screens/main/hooks/useGitChangesStatus";
import { useWorkspaceRename } from "renderer/screens/main/hooks/useWorkspaceRename";
import { useActiveDragItemStore } from "renderer/stores/active-drag-item";
import { useWorkspaceSelectionStore } from "renderer/stores/workspace-selection";
import { getHighestPriorityStatus } from "shared/tabs-types";
import { BranchTag } from "./BranchTag";
import { CollapsedWorkspaceItem } from "./CollapsedWorkspaceItem";
import { DeleteWorkspaceDialog, RenameBranchDialog } from "./components";
import { GITHUB_STATUS_STALE_TIME } from "./constants";
import { useWorkspaceDnD } from "./useWorkspaceDnD";
import { WorkspaceAheadBehind } from "./WorkspaceAheadBehind";
import { WorkspaceContextMenu } from "./WorkspaceContextMenu";

interface WorkspaceListItemProps {
	projectName?: string;
	projectMenu?: ReactNode;
	projectNameEditor?: ReactNode;
	onProjectMenuCloseAutoFocus?: (event: Event) => void;

	id: string;
	projectId: string;
	worktreePath: string;
	name: string;
	branch: string;
	type: "worktree" | "branch";
	isUnread?: boolean;
	index: number;
	shortcutIndex?: number;
	isCollapsed?: boolean;
	sectionId?: string | null;
	sections?: { id: string; name: string }[];
	orderedWorkspaceIds?: string[];
}

export function WorkspaceListItem({
	projectName,
	projectMenu,
	projectNameEditor,
	onProjectMenuCloseAutoFocus,
	id,
	projectId,
	worktreePath,
	name,
	branch,
	type,
	isUnread = false,
	index,
	isCollapsed = false,
	sectionId = null,
	sections = [],
	orderedWorkspaceIds = [],
}: WorkspaceListItemProps) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const isBranchWorkspace = type === "branch";
	const canDeleteWorkspace = !isBranchWorkspace;
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const {
		githubStatus,
		hasHovered,
		onMouseEnter: onGithubMouseEnter,
	} = useHoverGitHubStatus({
		workspaceId: id,
		surface: "workspace-list-item",
		isWorktree: type === "worktree",
	});
	const rename = useWorkspaceRename(id, name, branch);
	const { activeHostUrl: hostUrl } = useLocalHostService();
	const hostWorkspaceId = hostUrl ? id : null;
	const { data: pullRequestState, refetch: refetchPullRequestState } = useQuery(
		{
			queryKey: ["host-service", "pull-requests", hostUrl, hostWorkspaceId],
			enabled: !!hostUrl && !!hostWorkspaceId,
			queryFn: async () => {
				if (!hostUrl || !hostWorkspaceId) return null;
				const result = await getHostServiceClientByUrl(
					hostUrl,
				).pullRequests.getByWorkspaces.query({
					workspaceIds: [hostWorkspaceId],
				});
				return result.workspaces[0] ?? null;
			},
		},
	);
	const workspaceStatus = useHighestTerminalAgentStatusAtHost(
		hostUrl,
		hostWorkspaceId,
	);
	const panesWorkspace = usePanesWorkspaceState(id);
	const openAcpSessionIds = useMemo(
		() =>
			new Set(
				panesWorkspace.tabs.flatMap((tab) =>
					Object.values(tab.panes).flatMap((pane) =>
						pane.kind === "acp" && pane.data.acp?.sessionId
							? [pane.data.acp.sessionId]
							: [],
					),
				),
			),
		[panesWorkspace.tabs],
	);
	const acpStatus = useHighestAcpSessionStatusAtHost(
		hostUrl,
		hostWorkspaceId,
		openAcpSessionIds,
	);
	const combinedWorkspaceStatus = getHighestPriorityStatus([
		workspaceStatus ?? undefined,
		acpStatus ?? undefined,
	]);
	const markWorkspaceTerminalsSeen = useMarkWorkspaceTerminalsSeenAtHost(
		hostUrl,
		hostWorkspaceId,
	);
	const clearWorkspaceTerminalStatuses =
		useClearWorkspaceTerminalStatusesAtHost(hostUrl, hostWorkspaceId);
	const workspaceRunState = panesWorkspace.tabs
		.flatMap((tab) => Object.values(tab.panes))
		.find(
			(pane) =>
				pane.kind === "terminal" && pane.data.workspaceRun?.workspaceId === id,
		)?.data.workspaceRun?.state;
	const { setWorkspaceUnread } = useDashboardSidebarState();
	const isSelected = useWorkspaceSelectionStore((s) => s.selectedIds.has(id));
	const selectionStore = useWorkspaceSelectionStore;
	const isMultiDragging = useActiveDragItemStore(
		(s) =>
			s.activeDragItem?.selectedIds?.includes(id) && s.activeDragItem.id !== id,
	);

	const isActive = !!matchRoute({
		to: "/workspace/$workspaceId",
		params: { workspaceId: id },
		fuzzy: true,
	});

	const { isDragging, drag, drop } = useWorkspaceDnD({
		id,
		projectId,
		sectionId,
		index,
	});

	const expandedItemRef = useRef<HTMLDivElement>(null);
	const collapsedItemRef = useRef<HTMLButtonElement>(null);
	const [renameBranchTarget, setRenameBranchTarget] = useState<string | null>(
		null,
	);

	useEffect(() => {
		if (projectName) return;
		if (isCollapsed) {
			drag(drop(collapsedItemRef));
			return;
		}
		drag(drop(expandedItemRef));
	}, [drag, drop, isCollapsed, projectName]);

	useEffect(() => {
		if (!isActive) return;
		const activeNode =
			isCollapsed && !projectName
				? collapsedItemRef.current
				: expandedItemRef.current;
		activeNode?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [isActive, isCollapsed, projectName]);

	const openInFinder = electronTrpc.external.openInFinder.useMutation({
		onError: (error) => toast.error(`Failed to open: ${error.message}`),
	});
	const openFileInEditor = electronTrpc.external.openFileInEditor.useMutation({
		onError: (error) =>
			toast.error(`Failed to open in editor: ${error.message}`),
	});
	const { showDeleteDialog, setShowDeleteDialog, handleDeleteClick } =
		useWorkspaceDeleteHandler();
	const { status: localChanges } = useGitChangesStatus({
		workspaceId: id,
		worktreePath,
		enabled: hasHovered && !!worktreePath,
		staleTime: GITHUB_STATUS_STALE_TIME,
	});

	const { data: branchSyncStatus, refetch: refetchBranchSyncStatus } = useQuery(
		{
			queryKey: ["git-branch-sync-status", hostUrl, hostWorkspaceId],
			enabled: isBranchWorkspace && Boolean(hostUrl && hostWorkspaceId),
			staleTime: GITHUB_STATUS_STALE_TIME,
			queryFn: async () => {
				if (!hostUrl || !hostWorkspaceId) return null;
				return getHostServiceClientByUrl(hostUrl).git.getBranchSyncStatus.query(
					{
						workspaceId: hostWorkspaceId,
					},
				);
			},
		},
	);

	useBranchSyncInvalidation({
		gitBranch: localChanges?.branch,
		workspaceBranch: branch,
		workspaceId: id,
	});

	const handleClick = (e?: React.MouseEvent) => {
		if (rename.isRenaming) return;

		if (e?.metaKey) {
			selectionStore.getState().toggle(id, projectId);
			return;
		}

		if (e?.shiftKey) {
			const { lastClickedId } = selectionStore.getState();
			if (lastClickedId) {
				const lastIdx = orderedWorkspaceIds.indexOf(lastClickedId);
				const currIdx = orderedWorkspaceIds.indexOf(id);
				if (lastIdx !== -1 && currIdx !== -1) {
					const [start, end] = [
						Math.min(lastIdx, currIdx),
						Math.max(lastIdx, currIdx),
					];
					const rangeIds = orderedWorkspaceIds.slice(start, end + 1);
					selectionStore.getState().selectRange(rangeIds, projectId);
					return;
				}
			}
		}

		selectionStore.getState().clearSelection();
		selectionStore.setState({ lastClickedId: id });
		clearWorkspacePaneStatuses(id);
		markWorkspaceTerminalsSeen();
		navigateToWorkspace(id, navigate);
	};

	const handleMouseEnter = () => {
		onGithubMouseEnter();
		if (isBranchWorkspace) void refetchBranchSyncStatus();
	};

	const handleOpenInFinder = () => {
		if (worktreePath) openInFinder.mutate(worktreePath);
	};

	const handleOpenInEditor = () => {
		if (worktreePath)
			openFileInEditor.mutate({ path: worktreePath, projectId });
	};

	const { copyToClipboard } = useCopyToClipboard();
	const handleCopyPath = async () => {
		if (!worktreePath) return;
		await copyToClipboard(worktreePath);
		toast.success(t("workspace.pathCopied"));
	};
	const handleCopyBranchName = async () => {
		if (!branch) return;
		await copyToClipboard(branch);
		toast.success(t("workspace.branchCopied"));
	};
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const refreshLinkedPullRequest = async () => {
		await refetchPullRequestState();
		await queryClient.invalidateQueries({
			queryKey: ["host-github-status", hostUrl, hostWorkspaceId],
		});
	};
	const handleUnlinkPullRequest = async () => {
		if (!hostUrl || !hostWorkspaceId) return;
		try {
			await getHostServiceClientByUrl(
				hostUrl,
			).pullRequests.unlinkFromWorkspace.mutate({
				workspaceId: hostWorkspaceId,
			});
			toast.success("PR link removed");
			await refreshLinkedPullRequest();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	};
	const handleRestorePullRequest = async () => {
		if (!hostUrl || !hostWorkspaceId) return;
		try {
			await getHostServiceClientByUrl(
				hostUrl,
			).pullRequests.restoreToWorkspace.mutate({
				workspaceId: hostWorkspaceId,
			});
			toast.success("PR link restored");
			await refreshLinkedPullRequest();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	};

	const pr = githubStatus?.pr;
	const linkedPullRequest =
		pullRequestState?.pullRequest ??
		(pullRequestState?.isPullRequestSuppressed ? null : pr);
	/* 分支统一独占第二行：行高整齐，长分支也拿得到整行宽度 */
	const showBranchSubtitle = !isCollapsed && !!branch;

	if (isCollapsed && !projectName) {
		return (
			<CollapsedWorkspaceItem
				id={id}
				name={name}
				branch={branch}
				type={type}
				isActive={isActive}
				isUnread={isUnread}
				workspaceStatus={combinedWorkspaceStatus}
				itemRef={collapsedItemRef}
				showDeleteDialog={showDeleteDialog}
				setShowDeleteDialog={setShowDeleteDialog}
				onMouseEnter={handleMouseEnter}
				onClick={handleClick}
				onDeleteClick={handleDeleteClick}
				onCopyPath={handleCopyPath}
				onCopyBranchName={handleCopyBranchName}
			/>
		);
	}

	const content = (
		// biome-ignore lint/a11y/useSemanticElements: Contains nested interactive elements
		<div
			role="button"
			aria-label={projectName}
			aria-current={isActive ? "page" : undefined}
			title={projectName ? `${projectName} · ${branch}` : undefined}
			tabIndex={0}
			ref={expandedItemRef}
			onClick={handleClick}
			onKeyDown={(e) => {
				if (
					e.target === e.currentTarget &&
					(e.key === "Enter" || e.key === " ")
				) {
					e.preventDefault();
					handleClick();
				}
			}}
			onAuxClick={(e) => {
				if (e.button === 1 && canDeleteWorkspace) {
					e.preventDefault();
					handleDeleteClick();
				}
			}}
			onMouseEnter={handleMouseEnter}
			onDoubleClick={
				projectName || isBranchWorkspace ? undefined : rename.startRename
			}
			className={cn(
				// 行盒挂在组 guide 右侧（容器已给 25px）：项目行 lane 中心落在 40px，
				// workspace 子行左侧再让出一个 lane 宽，挂到二级 guide 右缘。
				// 分支标签独占第二行，所以行高统一为双行。
				"group/row relative flex w-full items-center gap-1.5 pr-2",
				showBranchSubtitle ? "h-10" : "h-8",
				projectName ? "pl-2 text-[13px]" : "pl-[22px] text-[13px]",
				"transition-colors duration-[120ms] text-left cursor-pointer rounded-ds-3",
				// 当前行升格为浮起卡片；hover 与选中保持 accent 语义
				isActive
					? "bg-surface-elev ring-1 ring-inset ring-line-strong shadow-ds-1 hover:bg-surface-elev"
					: "hover:bg-hover",
				isSelected && "bg-accent-tint ring-1 ring-inset ring-accent-line",
				projectName && isCollapsed && "!pl-1 !pr-1 w-9 justify-center",
				(isDragging || isMultiDragging) && "opacity-30",
			)}
			style={{ cursor: isDragging ? "grabbing" : "pointer" }}
		>
			{/* 2px 粉条：全站唯二的实心品牌色用法，卡片化之后仍然保留 */}
			{isActive && !isCollapsed && (
				<span className="absolute left-0 top-[5px] bottom-[5px] w-[2px] rounded-r-sm bg-accent-solid" />
			)}
			{/* lane：状态点通道常驻 14px，无状态时也保持整列对齐（收起态除外） */}
			{!(projectName && isCollapsed) && (
				<span className="flex w-[14px] shrink-0 justify-center">
					{combinedWorkspaceStatus && (
						<StatusIndicator status={combinedWorkspaceStatus} />
					)}
				</span>
			)}

			<div className="flex-1 min-w-0 flex flex-col justify-center gap-px">
				<div className="flex items-center gap-1.5 min-w-0">
					{rename.isRenaming ? (
						<Input
							ref={rename.inputRef}
							variant="ghost"
							value={rename.renameValue}
							onChange={(e) => rename.setRenameValue(e.target.value)}
							onBlur={rename.submitRename}
							onKeyDown={(e) => {
								e.stopPropagation();
								rename.handleKeyDown(e);
							}}
							onClick={(e) => e.stopPropagation()}
							onMouseDown={(e) => e.stopPropagation()}
							className="h-6 px-1 py-0 text-sm -ml-1"
						/>
					) : projectNameEditor ? (
						projectNameEditor
					) : (
						<span
							className={cn(
								// 名字是行的主角：满值 + medium 压过下方的彩色标签，
								// 当前行与未读行再加重一档
								"truncate transition-colors min-w-0 leading-[1.3] text-fg",
								isActive || isUnread ? "font-semibold" : "font-medium",
							)}
						>
							{projectName
								? isCollapsed
									? projectName.slice(0, 2)
									: projectName
								: isBranchWorkspace
									? "local"
									: name || branch}
						</span>
					)}

					{!isCollapsed && isBranchWorkspace && branchSyncStatus && (
						<WorkspaceAheadBehind
							pullCount={branchSyncStatus.pullCount}
							pushCount={branchSyncStatus.pushCount}
							hasUpstream={branchSyncStatus.hasUpstream}
						/>
					)}
					{workspaceRunState && !isCollapsed && (
						<WorkspaceRunIndicator state={workspaceRunState} variant="inline" />
					)}
					{isUnread && !(projectName && isCollapsed) && (
						<span className="ml-auto size-[5px] shrink-0 rounded-full bg-line-strong" />
					)}
				</div>

				{/* 分支标签独占第二行：前缀剥进颜色里，标签更短也更有辨识度 */}
				{showBranchSubtitle && <BranchTag branch={branch} />}
			</div>
		</div>
	);

	return (
		<>
			<WorkspaceContextMenu
				projectName={projectName}
				projectMenu={projectMenu}
				onProjectMenuCloseAutoFocus={onProjectMenuCloseAutoFocus}
				id={id}
				projectId={projectId}
				branch={branch}
				hostUrl={hostUrl ?? null}
				hostWorkspaceId={hostWorkspaceId ?? null}
				isBranchWorkspace={isBranchWorkspace}
				isUnread={isUnread}
				showDeleteHotkey={isActive && canDeleteWorkspace}
				workspaceStatus={combinedWorkspaceStatus}
				pullRequest={
					linkedPullRequest
						? { url: linkedPullRequest.url, number: linkedPullRequest.number }
						: null
				}
				isPullRequestSuppressed={
					pullRequestState?.isPullRequestSuppressed ?? false
				}
				onOpenPullRequest={() => {
					if (linkedPullRequest?.url) openUrl.mutate(linkedPullRequest.url);
				}}
				onOpenUrl={(url) => openUrl.mutate(url)}
				onUnlinkPullRequest={() => void handleUnlinkPullRequest()}
				onRestorePullRequest={() => void handleRestorePullRequest()}
				sections={sections}
				onRename={rename.startRename}
				onRenameBranch={() => setRenameBranchTarget(branch)}
				onOpenInFinder={handleOpenInFinder}
				onOpenInEditor={handleOpenInEditor}
				onCopyPath={handleCopyPath}
				onCopyBranchName={handleCopyBranchName}
				onSetUnread={(unread) => {
					try {
						setWorkspaceUnread(id, projectId, unread);
					} catch (error) {
						toast.error(
							`Failed to update unread status: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}}
				onResetStatus={() => {
					clearWorkspacePaneStatuses(id);
					void clearWorkspaceTerminalStatuses();
				}}
				onDelete={handleDeleteClick}
			>
				{content}
			</WorkspaceContextMenu>
			{renameBranchTarget && (
				<RenameBranchDialog
					workspaceId={id}
					currentBranchName={renameBranchTarget}
					hostUrl={hostUrl}
					hostWorkspaceId={hostWorkspaceId}
					open
					onOpenChange={(open) => {
						if (!open) setRenameBranchTarget(null);
					}}
				/>
			)}
			{canDeleteWorkspace && (
				<DeleteWorkspaceDialog
					workspaceId={id}
					workspaceName={name}
					workspaceType={type}
					open={showDeleteDialog}
					onOpenChange={setShowDeleteDialog}
				/>
			)}
		</>
	);
}
