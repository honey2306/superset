import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { HiEllipsisHorizontal } from "react-icons/hi2";
import { useHighestAcpSessionStatusAtHost } from "renderer/hooks/host-service/useAcpSessionStatuses";
import { useHighestTerminalAgentStatusAtHost } from "renderer/hooks/host-service/useTerminalAgentStatuses";
import {
	useClearWorkspaceTerminalStatusesAtHost,
	useMarkWorkspaceTerminalsSeenAtHost,
} from "renderer/hooks/host-service/useV2NotificationStatus";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useHoverGitHubStatus } from "renderer/lib/githubQueryPolicy";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useWorkspaceDeleteHandler } from "renderer/react-query/workspaces";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { WorkspaceRunIndicator } from "renderer/screens/main/components/WorkspaceRunIndicator";
import { useHostServiceTerminal } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useHostServiceTerminal";
import { useBranchSyncInvalidation } from "renderer/screens/main/hooks/useBranchSyncInvalidation";
import { useGitChangesStatus } from "renderer/screens/main/hooks/useGitChangesStatus";
import { useWorkspaceRename } from "renderer/screens/main/hooks/useWorkspaceRename";
import { useActiveDragItemStore } from "renderer/stores/active-drag-item";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useWorkspaceSelectionStore } from "renderer/stores/workspace-selection";
import { getHighestPriorityStatus } from "shared/tabs-types";
import { CollapsedWorkspaceItem } from "./CollapsedWorkspaceItem";
import { DeleteWorkspaceDialog, RenameBranchDialog } from "./components";
import { GITHUB_STATUS_STALE_TIME } from "./constants";
import { useWorkspaceDnD } from "./useWorkspaceDnD";
import { WorkspaceAheadBehind } from "./WorkspaceAheadBehind";
import { WorkspaceContextMenu } from "./WorkspaceContextMenu";
import { WorkspaceStatusBadge } from "./WorkspaceStatusBadge";

interface WorkspaceListItemProps {
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
	const electronUtils = electronTrpc.useUtils();
	const isBranchWorkspace = type === "branch";
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
	const { hostUrl, hostWorkspaceId } = useHostServiceTerminal({
		workspaceId: id,
		worktreePath,
		forceEnabled: true,
	});
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
	const acpStatus = useHighestAcpSessionStatusAtHost(hostUrl, hostWorkspaceId);
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
	const workspaceRunState = useTabsStore((state) => {
		for (const pane of Object.values(state.panes)) {
			if (pane.type === "terminal" && pane.workspaceRun?.workspaceId === id) {
				return pane.workspaceRun.state;
			}
		}
		return null;
	});
	const clearWorkspaceAttentionStatus = useTabsStore(
		(s) => s.clearWorkspaceAttentionStatus,
	);
	const resetWorkspaceStatus = useTabsStore((s) => s.resetWorkspaceStatus);
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
		if (isCollapsed) {
			drag(drop(collapsedItemRef));
			return;
		}
		drag(drop(expandedItemRef));
	}, [drag, drop, isCollapsed]);

	useEffect(() => {
		if (!isActive) return;
		const activeNode = isCollapsed
			? collapsedItemRef.current
			: expandedItemRef.current;
		activeNode?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [isActive, isCollapsed]);

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

	const { data: aheadBehind, refetch: refetchAheadBehind } =
		electronTrpc.workspaces.getAheadBehind.useQuery(
			{ workspaceId: id },
			{
				enabled: isBranchWorkspace,
				staleTime: GITHUB_STATUS_STALE_TIME,
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
		clearWorkspaceAttentionStatus(id);
		markWorkspaceTerminalsSeen();
		navigateToWorkspace(id, navigate);
	};

	const handleMouseEnter = () => {
		onGithubMouseEnter();
		if (isBranchWorkspace) void refetchAheadBehind();
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
	const handleMenuButtonClick = (
		event: React.MouseEvent<HTMLButtonElement>,
	) => {
		event.stopPropagation();
		const rect = event.currentTarget.getBoundingClientRect();
		event.currentTarget.dispatchEvent(
			new MouseEvent("contextmenu", {
				bubbles: true,
				clientX: rect.left + rect.width / 2,
				clientY: rect.top + rect.height / 2,
			}),
		);
	};
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const refreshLinkedPullRequest = async () => {
		await refetchPullRequestState();
		await electronUtils.workspaces.getGitHubStatus.invalidate({
			workspaceId: id,
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
	const showBranchSubtitle = isBranchWorkspace || (!!name && name !== branch);

	if (isCollapsed) {
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
			tabIndex={0}
			ref={expandedItemRef}
			onClick={handleClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					handleClick();
				}
			}}
			onAuxClick={(e) => {
				if (e.button === 1) {
					e.preventDefault();
					handleDeleteClick();
				}
			}}
			onMouseEnter={handleMouseEnter}
			onDoubleClick={isBranchWorkspace ? undefined : rename.startRename}
			className={cn(
				// DS: hover → --hover; active → accent-tint + 2px pink left bar.
				"flex w-full pl-11 pr-2 text-[13px]",
				"transition-colors duration-[120ms] text-left cursor-pointer rounded-ds-3",
				isActive ? "hover:bg-accent-tint" : "hover:bg-hover",
				"group relative",
				showBranchSubtitle ? "py-1.5" : "py-2 items-center",
				isActive && "bg-accent-tint",
				isSelected && "bg-accent-tint ring-1 ring-inset ring-accent-line",
				(isDragging || isMultiDragging) && "opacity-30",
			)}
			style={{ cursor: isDragging ? "grabbing" : "pointer" }}
		>
			{isActive && (
				<div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-accent-solid rounded-r-sm" />
			)}

			<div className="flex-1 min-w-0">
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
				) : (
					<div className="flex flex-col gap-0.5">
						<div className="flex items-center gap-1.5">
							<span
								className={cn(
									"truncate text-[13px] leading-tight transition-colors flex-1",
									isActive ? "text-fg font-medium" : "text-fg",
								)}
							>
								{isBranchWorkspace ? "local" : name || branch}
							</span>

							{isBranchWorkspace && aheadBehind && (
								<WorkspaceAheadBehind
									ahead={aheadBehind.ahead}
									behind={aheadBehind.behind}
								/>
							)}
							{workspaceRunState && showBranchSubtitle && (
								<WorkspaceRunIndicator
									state={workspaceRunState}
									variant="inline"
								/>
							)}

							<div className="grid shrink-0 h-5 [&>*]:col-start-1 [&>*]:row-start-1 items-center">
								<div className="flex items-center justify-end gap-1.5">
									<button
										type="button"
										onClick={handleMenuButtonClick}
										className="flex size-5 items-center justify-center rounded-ds-2 text-fg-faint transition-colors hover:bg-hover hover:text-fg"
										aria-label="Open workspace menu"
									>
										<HiEllipsisHorizontal className="size-4" />
									</button>
								</div>
							</div>
						</div>

						{(showBranchSubtitle || pr) && (
							<div className="flex items-center gap-2 text-[11px] w-full">
								{showBranchSubtitle && (
									<span className="truncate text-fg-faint font-mono tracking-[var(--ls-mono)] leading-tight">
										{branch}
									</span>
								)}
								{pr && (
									<WorkspaceStatusBadge
										state={pr.state}
										prNumber={pr.number}
										prUrl={pr.url}
										className="ml-auto"
									/>
								)}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);

	return (
		<>
			<WorkspaceContextMenu
				id={id}
				projectId={projectId}
				branch={branch}
				hostUrl={hostUrl ?? null}
				hostWorkspaceId={hostWorkspaceId ?? null}
				isBranchWorkspace={isBranchWorkspace}
				isUnread={isUnread}
				showDeleteHotkey={isActive}
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
					resetWorkspaceStatus(id);
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
			<DeleteWorkspaceDialog
				workspaceId={id}
				workspaceName={name}
				workspaceType={type}
				open={showDeleteDialog}
				onOpenChange={setShowDeleteDialog}
			/>
		</>
	);
}
