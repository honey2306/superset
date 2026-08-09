import { toast } from "@superset/ui/sonner";
import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getGitHubStatusQueryPolicy } from "renderer/lib/githubQueryPolicy";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useCatalogWorkspace } from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider/selectors";
import { useWorkspaceFileEvents } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents";
import { useBranchSyncInvalidation } from "renderer/screens/main/hooks/useBranchSyncInvalidation";
import { useGitChangesStatus } from "renderer/screens/main/hooks/useGitChangesStatus";
import { useChangesStore } from "renderer/stores/changes";
import {
	pathsMatch,
	retargetAbsolutePath,
	toAbsoluteWorkspacePath,
} from "shared/absolute-paths";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import type { FileSystemChangeEvent } from "shared/file-tree-types";
import { CategorySection } from "./components/CategorySection";
import { ChangesHeader } from "./components/ChangesHeader";
import { CommitInput } from "./components/CommitInput";
import { DiscardConfirmDialog } from "./components/DiscardConfirmDialog";
import { useOrderedSections } from "./hooks";
import { getPRActionState, shouldAutoCreatePRAfterPublish } from "./utils";

interface ChangesViewProps {
	onFileOpen?: (
		file: ChangedFile,
		category: ChangeCategory,
		commitHash?: string,
	) => void;
	isExpandedView?: boolean;
	isActive?: boolean;
}

const INACTIVE_BRANCH_REFETCH_INTERVAL_MS = 10_000;

interface PendingChangesRefresh {
	invalidateBranches: boolean;
	invalidateSelectedFile: boolean;
}

function eventTargetsSelectedFile(
	event: FileSystemChangeEvent,
	selectedAbsolutePath: string | null,
): boolean {
	if (!selectedAbsolutePath) {
		return false;
	}

	if (event.type === "overflow") {
		return true;
	}

	if (event.type === "rename" && event.absolutePath && event.oldAbsolutePath) {
		return (
			retargetAbsolutePath(
				selectedAbsolutePath,
				event.oldAbsolutePath,
				event.absolutePath,
				Boolean(event.isDirectory),
			) !== null
		);
	}

	return event.absolutePath === selectedAbsolutePath;
}

export function ChangesView({
	onFileOpen,
	isExpandedView,
	isActive = true,
}: ChangesViewProps) {
	const { t } = useTranslation();
	const { workspaceId } = useParams({ strict: false });
	const trpcUtils = electronTrpc.useUtils();
	const { workspace } = useCatalogWorkspace(workspaceId);
	const worktreePath = workspace?.worktreePath;
	const projectId = workspace?.projectId;
	const githubStatusQueryPolicy = getGitHubStatusQueryPolicy(
		"changes-sidebar",
		{
			hasWorkspaceId: !!workspaceId,
			isActive,
		},
	);

	const { status, isLoading, effectiveBaseBranch, branchData, refetch } =
		useGitChangesStatus({
			workspaceId,
			worktreePath,
			refetchInterval: isActive ? 2500 : undefined,
			refetchOnWindowFocus: isActive,
			branchRefetchInterval: isActive
				? undefined
				: INACTIVE_BRANCH_REFETCH_INTERVAL_MS,
			branchRefetchOnWindowFocus: true,
		});

	const {
		data: githubStatus,
		isLoading: isGitHubStatusLoading,
		refetch: refetchGithubStatus,
	} = electronTrpc.workspaces.getGitHubStatus.useQuery(
		{ workspaceId: workspaceId ?? "" },
		githubStatusQueryPolicy,
	);

	const stageAllMutation = electronTrpc.changes.stageAll.useMutation({
		onSuccess: () => refetch(),
		onError: (error) => {
			console.error("Failed to stage all files:", error);
			toast.error(
				t("v1Changes.toastStageAllFailed", { message: error.message }),
			);
		},
	});

	const unstageAllMutation = electronTrpc.changes.unstageAll.useMutation({
		onSuccess: () => refetch(),
		onError: (error) => {
			console.error("Failed to unstage all files:", error);
			toast.error(
				t("v1Changes.toastUnstageAllFailed", { message: error.message }),
			);
		},
	});

	const stageFileMutation = electronTrpc.changes.stageFile.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(`Failed to stage file ${variables.filePath}:`, error);
			toast.error(
				t("v1Changes.toastStageFileFailed", {
					path: variables.filePath,
					message: error.message,
				}),
			);
		},
	});

	const unstageFileMutation = electronTrpc.changes.unstageFile.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(`Failed to unstage file ${variables.filePath}:`, error);
			toast.error(
				t("v1Changes.toastUnstageFileFailed", {
					path: variables.filePath,
					message: error.message,
				}),
			);
		},
	});

	const stageFilesMutation = electronTrpc.changes.stageFiles.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(
				`Failed to stage files ${variables.filePaths.join(", ")}:`,
				error,
			);
			toast.error(
				t("v1Changes.toastStageFilesFailed", { message: error.message }),
			);
		},
	});

	const unstageFilesMutation = electronTrpc.changes.unstageFiles.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(
				`Failed to unstage files ${variables.filePaths.join(", ")}:`,
				error,
			);
			toast.error(
				t("v1Changes.toastUnstageFilesFailed", { message: error.message }),
			);
		},
	});

	const discardFilesMutation = electronTrpc.changes.discardFiles.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(
				`Failed to discard changes for ${variables.filePaths.join(", ")}:`,
				error,
			);
			toast.error(
				t("v1Changes.toastDiscardFilesFailed", { message: error.message }),
			);
		},
	});

	const deleteUntrackedMutation =
		electronTrpc.changes.deleteUntracked.useMutation({
			onSuccess: () => refetch(),
			onError: (error, variables) => {
				console.error(`Failed to delete ${variables.filePath}:`, error);
				toast.error(
					t("v1Changes.toastDeleteFileFailed", { message: error.message }),
				);
			},
		});

	const discardAllUnstagedMutation =
		electronTrpc.changes.discardAllUnstaged.useMutation({
			onSuccess: () => {
				toast.success(t("v1Changes.toastDiscardAllUnstagedSuccess"));
				refetch();
			},
			onError: (error) => {
				console.error("Failed to discard all unstaged:", error);
				toast.error(
					t("v1Changes.toastDiscardAllUnstagedFailed", {
						message: error.message,
					}),
				);
			},
		});

	const discardAllStagedMutation =
		electronTrpc.changes.discardAllStaged.useMutation({
			onSuccess: () => {
				toast.success(t("v1Changes.toastDiscardAllStagedSuccess"));
				refetch();
			},
			onError: (error) => {
				console.error("Failed to discard all staged:", error);
				toast.error(
					t("v1Changes.toastDiscardAllStagedFailed", {
						message: error.message,
					}),
				);
			},
		});

	const [showDiscardUnstagedDialog, setShowDiscardUnstagedDialog] =
		useState(false);
	const [showDiscardStagedDialog, setShowDiscardStagedDialog] = useState(false);
	const activePullRequest = githubStatus?.pr ?? null;
	const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingRefreshRef = useRef<PendingChangesRefresh>({
		invalidateBranches: false,
		invalidateSelectedFile: false,
	});
	useBranchSyncInvalidation({
		gitBranch: status?.branch ?? branchData?.currentBranch ?? undefined,
		workspaceBranch: workspace?.branch,
		workspaceId: workspaceId ?? "",
	});

	const handleRefresh = () => {
		refetch();
		refetchGithubStatus();
	};

	const handleDiscardFiles = (files: ChangedFile[]) => {
		if (!worktreePath) return;
		const isUntracked = (file: ChangedFile) =>
			file.status === "untracked" || file.status === "added";
		// Untracked/added files are deleted from disk; git never touches the
		// index for them, so per-file deletes can't race on index.lock.
		for (const file of files.filter(isUntracked)) {
			deleteUntrackedMutation.mutate({
				worktreePath,
				filePath: file.path,
			});
		}
		const trackedPaths = files
			.filter((file) => !isUntracked(file))
			.map((file) => file.path);
		if (trackedPaths.length > 0) {
			discardFilesMutation.mutate({
				worktreePath,
				filePaths: trackedPaths,
			});
		}
	};

	const {
		expandedSections,
		fileListViewMode,
		sectionOrder,
		selectFile,
		getSelectedFile,
		toggleSection,
		moveSection,
		setFileListViewMode,
	} = useChangesStore();

	const selectedFileState = getSelectedFile(workspaceId || "");
	const selectedFile = selectedFileState?.file ?? null;
	const selectedCommitHash = selectedFileState?.commitHash ?? null;

	const [expandedCommits, setExpandedCommits] = useState<Set<string>>(
		new Set(),
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on workspace change
	useEffect(() => {
		setExpandedCommits(new Set());
	}, [worktreePath]);

	useEffect(() => {
		return () => {
			if (refreshTimerRef.current) {
				clearTimeout(refreshTimerRef.current);
				refreshTimerRef.current = null;
			}
		};
	}, []);

	useWorkspaceFileEvents(
		workspaceId ?? "",
		(event) => {
			if (!worktreePath) {
				return;
			}

			const selectedAbsolutePath = selectedFileState?.absolutePath ?? null;
			pendingRefreshRef.current.invalidateBranches ||=
				event.type === "overflow";
			pendingRefreshRef.current.invalidateSelectedFile ||=
				eventTargetsSelectedFile(event, selectedAbsolutePath);

			if (refreshTimerRef.current) {
				clearTimeout(refreshTimerRef.current);
			}

			refreshTimerRef.current = setTimeout(() => {
				refreshTimerRef.current = null;
				const pending = pendingRefreshRef.current;
				pendingRefreshRef.current = {
					invalidateBranches: false,
					invalidateSelectedFile: false,
				};

				const invalidations: Promise<unknown>[] = [
					trpcUtils.changes.getStatus.invalidate({
						worktreePath,
					}),
				];

				if (pending.invalidateBranches) {
					invalidations.push(
						trpcUtils.changes.getBranches.invalidate({ worktreePath }),
					);
				}

				if (pending.invalidateSelectedFile && selectedFileState) {
					const oldAbsPath = selectedFileState.file.oldPath
						? toAbsoluteWorkspacePath(
								worktreePath,
								selectedFileState.file.oldPath,
							)
						: undefined;
					invalidations.push(
						trpcUtils.changes.getGitFileContents.invalidate({
							worktreePath,
							absolutePath: selectedFileState.absolutePath,
							oldAbsolutePath: oldAbsPath,
						}),
						trpcUtils.changes.getGitOriginalContent.invalidate({
							worktreePath,
							absolutePath: selectedFileState.absolutePath,
							oldAbsolutePath: oldAbsPath,
						}),
					);
					if (workspaceId) {
						invalidations.push(
							trpcUtils.filesystem.readFile.invalidate({
								workspaceId,
								absolutePath: selectedFileState.absolutePath,
							}),
						);
					}
				}

				Promise.all(invalidations).catch((error) => {
					console.error("[ChangesView] Failed to refresh changes state:", {
						worktreePath,
						error,
					});
				});
			}, 75);
		},
		Boolean(workspaceId && worktreePath),
	);

	const expandedCommitHashes = useMemo(
		() =>
			isActive && expandedSections.committed
				? Array.from(expandedCommits)
				: ([] as string[]),
		[isActive, expandedSections.committed, expandedCommits],
	);

	const commitFilesQueries = electronTrpc.useQueries((t) =>
		expandedCommitHashes.map((hash) =>
			t.changes.getCommitFiles({
				worktreePath: worktreePath || "",
				commitHash: hash,
			}),
		),
	);

	const commitFilesMap = useMemo(() => {
		const map = new Map<string, ChangedFile[]>();
		expandedCommitHashes.forEach((hash, index) => {
			const query = commitFilesQueries[index];
			if (query?.data) {
				map.set(hash, query.data);
			}
		});
		return map;
	}, [expandedCommitHashes, commitFilesQueries]);

	const combinedUnstaged = useMemo(
		() =>
			status?.unstaged && status?.untracked
				? [...status.unstaged, ...status.untracked]
				: [],
		[status?.unstaged, status?.untracked],
	);

	const handleFileSelect = (file: ChangedFile, category: ChangeCategory) => {
		if (!workspaceId || !worktreePath) return;
		selectFile(
			workspaceId,
			toAbsoluteWorkspacePath(worktreePath, file.path),
			file,
			category,
			null,
		);
		onFileOpen?.(file, category);
	};

	const handleCommitFileSelect = (file: ChangedFile, commitHash: string) => {
		if (!workspaceId || !worktreePath) return;
		selectFile(
			workspaceId,
			toAbsoluteWorkspacePath(worktreePath, file.path),
			file,
			"committed",
			commitHash,
		);
		onFileOpen?.(file, "committed", commitHash);
	};

	const handleCommitToggle = (hash: string) => {
		setExpandedCommits((prev) => {
			const next = new Set(prev);
			if (next.has(hash)) {
				next.delete(hash);
			} else {
				next.add(hash);
			}
			return next;
		});
	};

	const againstBaseFiles = status?.againstBase ?? [];
	const commits = status?.commits ?? [];
	const stagedFiles = status?.staged ?? [];
	const unstagedFiles = status?.unstaged ?? [];
	const untrackedFiles = status?.untracked ?? [];

	const hasChanges =
		againstBaseFiles.length > 0 ||
		commits.length > 0 ||
		stagedFiles.length > 0 ||
		unstagedFiles.length > 0 ||
		untrackedFiles.length > 0;

	const commitsWithFiles = commits.map((commit) => ({
		...commit,
		files: commitFilesMap.get(commit.hash) || commit.files,
	}));

	useEffect(() => {
		if (!workspaceId || !worktreePath || !selectedFileState) {
			return;
		}

		const existsInSelection =
			selectedFileState.category === "against-base"
				? againstBaseFiles.some((file) =>
						pathsMatch(
							toAbsoluteWorkspacePath(worktreePath, file.path),
							selectedFileState.absolutePath,
						),
					)
				: selectedFileState.category === "staged"
					? stagedFiles.some((file) =>
							pathsMatch(
								toAbsoluteWorkspacePath(worktreePath, file.path),
								selectedFileState.absolutePath,
							),
						)
					: selectedFileState.category === "unstaged"
						? combinedUnstaged.some((file) =>
								pathsMatch(
									toAbsoluteWorkspacePath(worktreePath, file.path),
									selectedFileState.absolutePath,
								),
							)
						: selectedFileState.category === "committed";

		if (!existsInSelection) {
			selectFile(workspaceId, null, null);
		}
	}, [
		againstBaseFiles,
		combinedUnstaged,
		selectFile,
		selectedFileState,
		stagedFiles,
		workspaceId,
		worktreePath,
	]);

	const hasStagedChanges = stagedFiles.length > 0;
	const hasExistingPR = !!activePullRequest;
	const hasGitHubRepo = !!githubStatus?.repoUrl;
	const defaultBranch =
		branchData?.defaultBranch ?? status?.defaultBranch ?? "";
	const isDefaultBranch = status?.branch === defaultBranch;
	const prActionState = getPRActionState({
		hasRepo: hasGitHubRepo,
		hasExistingPR,
		hasUpstream: status?.hasUpstream ?? false,
		pushCount: status?.pushCount ?? 0,
		pullCount: status?.pullCount ?? 0,
		isDefaultBranch,
	});
	const shouldAutoCreatePR =
		hasGitHubRepo &&
		shouldAutoCreatePRAfterPublish({
			hasExistingPR,
			isDefaultBranch,
		});
	const orderedSections = useOrderedSections({
		sectionOrder,
		effectiveBaseBranch: effectiveBaseBranch ?? "",
		expandedSections,
		toggleSection,
		fileListViewMode,
		selectedFile,
		selectedCommitHash,
		worktreePath: worktreePath ?? "",
		projectId,
		isExpandedView,
		againstBaseFiles,
		onAgainstBaseFileSelect: (file) => handleFileSelect(file, "against-base"),
		commitsWithFiles,
		totalCommitCount: status?.totalCommitCount ?? commits.length,
		expandedCommits,
		onCommitToggle: handleCommitToggle,
		onCommitFileSelect: handleCommitFileSelect,
		stagedFiles,
		onStagedFileSelect: (file) => handleFileSelect(file, "staged"),
		onUnstageFile: (file) =>
			unstageFileMutation.mutate({
				worktreePath: worktreePath || "",
				filePath: file.path,
			}),
		onUnstageFiles: (files) =>
			unstageFilesMutation.mutate({
				worktreePath: worktreePath || "",
				filePaths: files.map((f) => f.path),
			}),
		onShowDiscardStagedDialog: () => setShowDiscardStagedDialog(true),
		onUnstageAll: () =>
			unstageAllMutation.mutate({
				worktreePath: worktreePath || "",
			}),
		isDiscardAllStagedPending: discardAllStagedMutation.isPending,
		isUnstageAllPending: unstageAllMutation.isPending,
		isStagedActioning:
			unstageFileMutation.isPending ||
			unstageFilesMutation.isPending ||
			unstageAllMutation.isPending ||
			discardAllStagedMutation.isPending,
		unstagedFiles: combinedUnstaged,
		onUnstagedFileSelect: (file) => handleFileSelect(file, "unstaged"),
		onStageFile: (file) =>
			stageFileMutation.mutate({
				worktreePath: worktreePath || "",
				filePath: file.path,
			}),
		onStageFiles: (files) =>
			stageFilesMutation.mutate({
				worktreePath: worktreePath || "",
				filePaths: files.map((f) => f.path),
			}),
		onDiscardFiles: handleDiscardFiles,
		onShowDiscardUnstagedDialog: () => setShowDiscardUnstagedDialog(true),
		onStageAll: () =>
			stageAllMutation.mutate({
				worktreePath: worktreePath || "",
			}),
		isDiscardAllUnstagedPending: discardAllUnstagedMutation.isPending,
		isStageAllPending: stageAllMutation.isPending,
		isUnstagedActioning:
			stageFileMutation.isPending ||
			stageFilesMutation.isPending ||
			stageAllMutation.isPending ||
			discardFilesMutation.isPending ||
			deleteUntrackedMutation.isPending ||
			discardAllUnstagedMutation.isPending,
	});

	if (!worktreePath) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				{t("v1Changes.noWorkspaceSelected")}
			</div>
		);
	}

	if (!status && isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				{t("v1Changes.loadingChanges")}
			</div>
		);
	}

	if (
		!status ||
		!status.againstBase ||
		!status.commits ||
		!status.staged ||
		!status.unstaged ||
		!status.untracked
	) {
		return (
			<div className="flex-1 flex select-text cursor-text items-center justify-center text-muted-foreground text-sm p-4">
				{t("v1Changes.unableToLoad")}
			</div>
		);
	}

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<ChangesHeader
				onRefresh={handleRefresh}
				viewMode={fileListViewMode}
				onViewModeChange={setFileListViewMode}
				showViewModeToggle
				worktreePath={worktreePath}
				workspaceId={workspaceId ?? ""}
				pullCount={status.pullCount}
				pr={githubStatus?.pr ?? null}
				isPRStatusLoading={isGitHubStatusLoading}
				canCreatePR={prActionState.canCreatePR}
				createPRBlockedReason={prActionState.createPRBlockedReason}
			/>
			<div className="border-b border-border">
				<CommitInput
					worktreePath={worktreePath}
					hasStagedChanges={hasStagedChanges}
					pushCount={status.pushCount}
					pullCount={status.pullCount}
					hasUpstream={status.hasUpstream}
					pullRequest={activePullRequest ?? null}
					canCreatePR={prActionState.canCreatePR}
					shouldAutoCreatePRAfterPublish={shouldAutoCreatePR}
					onRefresh={handleRefresh}
				/>
			</div>

			{!hasChanges ? (
				<div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
					{t("v1Changes.noChangesDetected")}
				</div>
			) : (
				<div
					className="min-h-0 flex-1 overflow-y-auto"
					data-changes-scroll-container
				>
					{orderedSections
						.filter((section) => section.count > 0)
						.map((section) => (
							<CategorySection
								key={section.id}
								id={section.id}
								title={section.title}
								count={section.count}
								isExpanded={section.isExpanded}
								onToggle={section.onToggle}
								actions={section.actions}
								onMove={moveSection}
							>
								{section.content}
							</CategorySection>
						))}
				</div>
			)}

			<DiscardConfirmDialog
				open={showDiscardUnstagedDialog}
				onOpenChange={setShowDiscardUnstagedDialog}
				title={t("v1Changes.discardAllUnstagedTitle")}
				description={t("v1Changes.discardAllUnstagedDesc")}
				onConfirm={() =>
					discardAllUnstagedMutation.mutate({
						worktreePath: worktreePath || "",
					})
				}
				confirmLabel={t("v1Changes.discardAll")}
			/>

			<DiscardConfirmDialog
				open={showDiscardStagedDialog}
				onOpenChange={setShowDiscardStagedDialog}
				title={t("v1Changes.discardAllStagedTitle")}
				description={t("v1Changes.discardAllStagedDesc")}
				onConfirm={() =>
					discardAllStagedMutation.mutate({
						worktreePath: worktreePath || "",
					})
				}
				confirmLabel={t("v1Changes.discardAll")}
			/>
		</div>
	);
}
