import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useMutation } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useCatalogWorkspace } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
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
	const hostWorkspaceId = workspaceId ?? "";
	const hostUtils = workspaceTrpc.useUtils();
	const { activeHostUrl } = useLocalHostService();
	const { workspace } = useCatalogWorkspace(workspaceId);
	const worktreePath = workspace?.worktreePath;
	const projectId = workspace?.projectId;
	const { status, isLoading, branchData, refetch } = useGitChangesStatus({
		workspaceId,
		worktreePath,
		refetchInterval: isActive ? 2500 : undefined,
		refetchOnWindowFocus: isActive,
		branchRefetchInterval: isActive
			? undefined
			: INACTIVE_BRANCH_REFETCH_INTERVAL_MS,
		branchRefetchOnWindowFocus: true,
	});

	const getHostGit = () => {
		if (!activeHostUrl || !workspaceId) {
			throw new Error("Workspace host is unavailable");
		}
		return getHostServiceClientByUrl(activeHostUrl).git;
	};

	const stageAllMutation = useMutation({
		mutationFn: () =>
			getHostGit().stageAll.mutate({ workspaceId: hostWorkspaceId }),
		onSuccess: () => refetch(),
		onError: (error) => {
			console.error("Failed to stage all files:", error);
			toast.error(t("changes.toastStageAllFailed", { message: error.message }));
		},
	});

	const unstageAllMutation = useMutation({
		mutationFn: () =>
			getHostGit().unstageAll.mutate({ workspaceId: hostWorkspaceId }),
		onSuccess: () => refetch(),
		onError: (error) => {
			console.error("Failed to unstage all files:", error);
			toast.error(
				t("changes.toastUnstageAllFailed", { message: error.message }),
			);
		},
	});

	const stageFileMutation = useMutation({
		mutationFn: ({ filePath }: { filePath: string }) =>
			getHostGit().stageFiles.mutate({
				workspaceId: hostWorkspaceId,
				filePaths: [filePath],
			}),
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(`Failed to stage file ${variables.filePath}:`, error);
			toast.error(
				t("changes.toastStageFileFailed", {
					path: variables.filePath,
					message: error.message,
				}),
			);
		},
	});

	const unstageFileMutation = useMutation({
		mutationFn: ({ filePath }: { filePath: string }) =>
			getHostGit().unstageFiles.mutate({
				workspaceId: hostWorkspaceId,
				filePaths: [filePath],
			}),
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(`Failed to unstage file ${variables.filePath}:`, error);
			toast.error(
				t("changes.toastUnstageFileFailed", {
					path: variables.filePath,
					message: error.message,
				}),
			);
		},
	});

	const stageFilesMutation = useMutation({
		mutationFn: ({ filePaths }: { filePaths: string[] }) =>
			getHostGit().stageFiles.mutate({
				workspaceId: hostWorkspaceId,
				filePaths,
			}),
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(
				`Failed to stage files ${variables.filePaths.join(", ")}:`,
				error,
			);
			toast.error(
				t("changes.toastStageFilesFailed", { message: error.message }),
			);
		},
	});

	const unstageFilesMutation = useMutation({
		mutationFn: ({ filePaths }: { filePaths: string[] }) =>
			getHostGit().unstageFiles.mutate({
				workspaceId: hostWorkspaceId,
				filePaths,
			}),
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(
				`Failed to unstage files ${variables.filePaths.join(", ")}:`,
				error,
			);
			toast.error(
				t("changes.toastUnstageFilesFailed", { message: error.message }),
			);
		},
	});

	const discardFilesMutation = useMutation({
		mutationFn: ({ filePaths }: { filePaths: string[] }) =>
			getHostGit().discardFiles.mutate({
				workspaceId: hostWorkspaceId,
				filePaths,
			}),
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(
				`Failed to discard changes for ${variables.filePaths.join(", ")}:`,
				error,
			);
			toast.error(
				t("changes.toastDiscardFilesFailed", { message: error.message }),
			);
		},
	});

	const deleteUntrackedMutation = useMutation({
		mutationFn: ({ filePath }: { filePath: string }) =>
			getHostGit().discardFiles.mutate({
				workspaceId: hostWorkspaceId,
				filePaths: [filePath],
			}),
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(`Failed to delete ${variables.filePath}:`, error);
			toast.error(
				t("changes.toastDeleteFileFailed", { message: error.message }),
			);
		},
	});

	const discardAllUnstagedMutation = useMutation({
		mutationFn: () =>
			getHostGit().discardAllUnstaged.mutate({ workspaceId: hostWorkspaceId }),
		onSuccess: () => {
			toast.success(t("changes.toastDiscardAllUnstagedSuccess"));
			refetch();
		},
		onError: (error) => {
			console.error("Failed to discard all unstaged:", error);
			toast.error(
				t("changes.toastDiscardAllUnstagedFailed", {
					message: error.message,
				}),
			);
		},
	});

	const discardAllStagedMutation = useMutation({
		mutationFn: () =>
			getHostGit().discardAllStaged.mutate({ workspaceId: hostWorkspaceId }),
		onSuccess: () => {
			toast.success(t("changes.toastDiscardAllStagedSuccess"));
			refetch();
		},
		onError: (error) => {
			console.error("Failed to discard all staged:", error);
			toast.error(
				t("changes.toastDiscardAllStagedFailed", {
					message: error.message,
				}),
			);
		},
	});

	const [showDiscardUnstagedDialog, setShowDiscardUnstagedDialog] =
		useState(false);
	const [showDiscardStagedDialog, setShowDiscardStagedDialog] = useState(false);
	const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingRefreshRef = useRef<PendingChangesRefresh>({
		invalidateSelectedFile: false,
	});
	useBranchSyncInvalidation({
		gitBranch: status?.branch ?? branchData?.currentBranch ?? undefined,
		workspaceBranch: workspace?.branch,
		workspaceId: workspaceId ?? "",
	});
	const handleRefresh = () => {
		refetch();
	};

	const handleDiscardFiles = (files: ChangedFile[]) => {
		const isUntracked = (file: ChangedFile) =>
			file.status === "untracked" || file.status === "added";
		for (const file of files.filter(isUntracked)) {
			deleteUntrackedMutation.mutate({ filePath: file.path });
		}
		const trackedPaths = files
			.filter((file) => !isUntracked(file))
			.map((file) => file.path);
		if (trackedPaths.length > 0) {
			discardFilesMutation.mutate({ filePaths: trackedPaths });
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
			pendingRefreshRef.current.invalidateSelectedFile ||=
				eventTargetsSelectedFile(event, selectedAbsolutePath);

			if (refreshTimerRef.current) {
				clearTimeout(refreshTimerRef.current);
			}

			refreshTimerRef.current = setTimeout(() => {
				refreshTimerRef.current = null;
				const pending = pendingRefreshRef.current;
				pendingRefreshRef.current = {
					invalidateSelectedFile: false,
				};

				const invalidations: Promise<unknown>[] = [];

				if (
					pending.invalidateSelectedFile &&
					selectedFileState &&
					workspaceId
				) {
					invalidations.push(
						hostUtils.git.getDiff.invalidate({ workspaceId }),
						hostUtils.filesystem.readFile.invalidate({
							workspaceId,
							absolutePath: selectedFileState.absolutePath,
						}),
					);
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

	const stagedFiles = status?.staged ?? [];
	const unstagedFiles = status?.unstaged ?? [];
	const untrackedFiles = status?.untracked ?? [];

	const hasChanges =
		stagedFiles.length > 0 ||
		unstagedFiles.length > 0 ||
		untrackedFiles.length > 0;

	useEffect(() => {
		if (!workspaceId || !worktreePath || !selectedFileState) {
			return;
		}

		const existsInSelection =
			selectedFileState.category === "staged"
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
					: false;

		if (!existsInSelection) {
			selectFile(workspaceId, null, null);
		}
	}, [
		combinedUnstaged,
		selectFile,
		selectedFileState,
		stagedFiles,
		workspaceId,
		worktreePath,
	]);

	const hasStagedChanges = stagedFiles.length > 0;
	const orderedSections = useOrderedSections({
		sectionOrder,
		expandedSections,
		toggleSection,
		fileListViewMode,
		selectedFile,
		selectedCommitHash,
		worktreePath: worktreePath ?? "",
		projectId,
		isExpandedView,
		stagedFiles,
		onStagedFileSelect: (file) => handleFileSelect(file, "staged"),
		onUnstageFile: (file) =>
			unstageFileMutation.mutate({ filePath: file.path }),
		onUnstageFiles: (files) =>
			unstageFilesMutation.mutate({ filePaths: files.map((f) => f.path) }),
		onShowDiscardStagedDialog: () => setShowDiscardStagedDialog(true),
		onUnstageAll: () => unstageAllMutation.mutate(),
		isDiscardAllStagedPending: discardAllStagedMutation.isPending,
		isUnstageAllPending: unstageAllMutation.isPending,
		isStagedActioning:
			unstageFileMutation.isPending ||
			unstageFilesMutation.isPending ||
			unstageAllMutation.isPending ||
			discardAllStagedMutation.isPending,
		unstagedFiles: combinedUnstaged,
		onUnstagedFileSelect: (file) => handleFileSelect(file, "unstaged"),
		onStageFile: (file) => stageFileMutation.mutate({ filePath: file.path }),
		onStageFiles: (files) =>
			stageFilesMutation.mutate({ filePaths: files.map((f) => f.path) }),
		onDiscardFiles: handleDiscardFiles,
		onShowDiscardUnstagedDialog: () => setShowDiscardUnstagedDialog(true),
		onStageAll: () => stageAllMutation.mutate(),
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
			<div className="flex-1 flex items-center justify-center text-fg-mute text-sm p-4">
				{t("changes.noWorkspaceSelected")}
			</div>
		);
	}

	if (!status && isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center text-fg-mute text-sm p-4">
				{t("changes.loadingChanges")}
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
			<div className="flex-1 flex select-text cursor-text items-center justify-center text-fg-mute text-sm p-4">
				{t("changes.unableToLoad")}
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
			/>
			<div className="border-b border-line">
				<CommitInput
					workspaceId={hostWorkspaceId}
					hasStagedChanges={hasStagedChanges}
					onRefresh={handleRefresh}
				/>
			</div>

			{!hasChanges ? (
				<div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-fg-mute">
					{t("changes.noChangesDetected")}
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
				title={t("changes.discardAllUnstagedTitle")}
				description={t("changes.discardAllUnstagedDesc")}
				onConfirm={() => discardAllUnstagedMutation.mutate()}
				confirmLabel={t("changes.discardAll")}
			/>

			<DiscardConfirmDialog
				open={showDiscardStagedDialog}
				onOpenChange={setShowDiscardStagedDialog}
				title={t("changes.discardAllStagedTitle")}
				description={t("changes.discardAllStagedDesc")}
				onConfirm={() => discardAllStagedMutation.mutate()}
				confirmLabel={t("changes.discardAll")}
			/>
		</div>
	);
}
