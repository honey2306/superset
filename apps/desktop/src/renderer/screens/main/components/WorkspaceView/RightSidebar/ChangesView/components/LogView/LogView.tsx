import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import { LuChevronDown, LuGitBranch, LuSearch, LuX } from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useChangesStore } from "renderer/stores/changes";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type { ChangedFile } from "shared/changes-types";
import { FileList } from "../FileList";
import type { ResetMode } from "../ResetToCommitDialog";
import { ResetToCommitDialog } from "../ResetToCommitDialog";
import {
	type CommitDiffStats,
	type GitHistoryEntry,
	GitHistoryRow,
} from "./GitHistoryRow";
import { getLoadedCommitCount, toggleSelectedCommit } from "./utils";

const PAGE_SIZE = 50;
const MAX_LOG_RESULTS = 500;

type BranchScope = "current" | "all";

interface LogViewProps {
	worktreePath: string;
	workspaceId: string;
	branch?: string;
	projectId?: string;
	isActive?: boolean;
	onFileOpen?: (file: ChangedFile, commitHash: string) => void;
	onRefresh?: () => void;
}

export function LogView({
	worktreePath,
	workspaceId,
	branch,
	projectId,
	isActive = true,
	onFileOpen,
	onRefresh,
}: LogViewProps) {
	const { t } = useTranslation();
	const { copyToClipboard } = useCopyToClipboard();
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState("");
	const deferredFilter = useDeferredValue(filter);
	const trimmedFilter = deferredFilter.trim();
	const [limit, setLimit] = useState(PAGE_SIZE);
	const [branchScope, setBranchScope] = useState<BranchScope>("current");
	const [selectedHash, setSelectedHash] = useState<string | null>(null);
	const [resetTarget, setResetTarget] = useState<{
		hash: string;
		shortHash: string;
	} | null>(null);

	const selectFile = useChangesStore((state) => state.selectFile);
	const selectedFileState = useChangesStore((state) =>
		state.getSelectedFile(workspaceId),
	);
	const fileListViewMode = useChangesStore((state) => state.fileListViewMode);
	const allBranches = branchScope === "all";

	const logQueryKey = [
		"git-log",
		activeHostUrl,
		workspaceId,
		limit,
		trimmedFilter,
		allBranches,
	] as const;
	const { data, isLoading, isFetching } = useQuery({
		queryKey: logQueryKey,
		enabled: isActive && Boolean(activeHostUrl && workspaceId),
		queryFn: async () => {
			if (!activeHostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(activeHostUrl).git.listLog.query({
				workspaceId,
				limit,
				skip: 0,
				search: trimmedFilter || undefined,
				all: allBranches,
			});
		},
		placeholderData: keepPreviousData,
		staleTime: 0,
		refetchInterval: isActive ? 2500 : false,
		refetchOnWindowFocus: isActive,
	});

	const commits = useMemo<GitHistoryEntry[]>(
		() =>
			(data ?? []).map((entry) => ({
				hash: entry.hash,
				shortHash: entry.shortHash,
				message: entry.message,
				author: entry.author,
				date: entry.date,
				parents: entry.parents ?? [],
				refs: entry.refs ?? [],
				branch: entry.branch,
			})),
		[data],
	);
	const currentBranch = useMemo(
		() =>
			branch ??
			commits.find((entry) =>
				entry.refs.some((ref) => ref.startsWith("HEAD -> ")),
			)?.branch ??
			commits.find((entry) => entry.branch)?.branch ??
			"HEAD",
		[branch, commits],
	);

	const selectedFilesQuery = useQuery({
		queryKey: ["git-commit-files", activeHostUrl, workspaceId, selectedHash],
		enabled: Boolean(activeHostUrl && workspaceId && selectedHash),
		queryFn: async () => {
			if (!activeHostUrl || !selectedHash) {
				throw new Error("Workspace host is unavailable");
			}
			const result = await getHostServiceClientByUrl(
				activeHostUrl,
			).git.getCommitFiles.query({
				workspaceId,
				commitHash: selectedHash,
			});
			return result.files.map((file) => ({
				...file,
				status: file.status === "changed" ? "modified" : file.status,
			}));
		},
		staleTime: 60_000,
	});
	const selectedDiffStats = useMemo<CommitDiffStats | undefined>(() => {
		const files = selectedFilesQuery.data;
		if (!files) return undefined;
		return {
			files: files.length,
			additions: files.reduce((total, file) => total + file.additions, 0),
			deletions: files.reduce((total, file) => total + file.deletions, 0),
		};
	}, [selectedFilesQuery.data]);

	const resetMutation = useMutation({
		mutationFn: async ({
			commit,
			mode,
		}: {
			commit: string;
			mode: ResetMode;
		}) => {
			if (!activeHostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(activeHostUrl).git.resetToCommit.mutate({
				workspaceId,
				commit,
				mode,
			});
		},
		onSuccess: async () => {
			toast.success(
				t("changes.reset.toastDone", {
					commit: resetTarget?.shortHash ?? "",
				}),
			);
			await queryClient.invalidateQueries({
				queryKey: ["git-log", activeHostUrl, workspaceId],
			});
			await queryClient.invalidateQueries({
				queryKey: ["git-branches", activeHostUrl, workspaceId],
			});
			setResetTarget(null);
			onRefresh?.();
		},
		onError: (error) => {
			toast.error(t("changes.reset.toastFailed", { message: error.message }));
		},
	});

	const clearCommitSelection = () => {
		setSelectedHash(null);
		if (selectedFileState?.category === "committed") {
			selectFile(workspaceId, null, null);
		}
	};

	const handleFileSelect = (file: ChangedFile) => {
		if (!selectedHash) return;
		selectFile(
			workspaceId,
			toAbsoluteWorkspacePath(worktreePath, file.path),
			file,
			"committed",
			selectedHash,
		);
		onFileOpen?.(file, selectedHash);
	};

	const handleCommitSelect = (commitHash: string) => {
		const nextHash = toggleSelectedCommit(selectedHash, commitHash);
		setSelectedHash(nextHash);
		if (!nextHash && selectedFileState?.commitHash === commitHash) {
			selectFile(workspaceId, null, null);
		}
	};

	const canLoadMore = commits.length >= limit && limit < MAX_LOG_RESULTS;
	const resultCount = getLoadedCommitCount(commits.length, canLoadMore);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="shrink-0 border-b border-line/60 bg-surface/40 px-2 py-2">
				<div className="flex min-w-0 items-center gap-1.5">
					<div className="relative min-w-0 flex-1">
						<LuSearch className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-faint" />
						<Input
							value={filter}
							onChange={(event) => {
								setFilter(event.target.value);
								setLimit(PAGE_SIZE);
								clearCommitSelection();
							}}
							placeholder={t("changes.log.filterPlaceholder")}
							className="h-7 bg-surface pl-7 pr-7 text-xs"
						/>
						{filter ? (
							<button
								type="button"
								className="absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-ds-2 text-fg-faint hover:bg-hover hover:text-fg"
								onClick={() => {
									setFilter("");
									setLimit(PAGE_SIZE);
									clearCommitSelection();
								}}
								aria-label={t("changes.log.clearFilter")}
							>
								<LuX className="size-3" />
							</button>
						) : null}
					</div>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="h-7 max-w-[126px] min-w-0 gap-1.5 px-2 text-[10px]"
								title={t("changes.log.branchScope")}
							>
								<LuGitBranch className="size-3 shrink-0" />
								<span className="truncate">
									{branchScope === "all"
										? t("changes.log.allBranches")
										: t("changes.log.currentBranch")}
								</span>
								<LuChevronDown className="size-3 shrink-0 text-fg-faint" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="min-w-44">
							<DropdownMenuRadioGroup
								value={branchScope}
								onValueChange={(value) => {
									setBranchScope(value as BranchScope);
									setLimit(PAGE_SIZE);
									clearCommitSelection();
								}}
							>
								<DropdownMenuRadioItem value="current">
									{t("changes.log.currentBranch")}
								</DropdownMenuRadioItem>
								<DropdownMenuRadioItem value="all">
									{t("changes.log.allBranches")}
								</DropdownMenuRadioItem>
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				<div className="mt-1.5 flex min-w-0 items-center gap-1 text-[10px] text-fg-faint">
					<span className="font-medium text-fg-mute">
						{t("changes.log.commitCount", { count: resultCount })}
					</span>
					{branchScope === "current" ? (
						<span className="min-w-0 truncate">
							{t("changes.log.onBranch", { branch: currentBranch })}
						</span>
					) : null}
					<span className="ml-auto flex shrink-0 items-center gap-1">
						<span className="size-1.5 rounded-full bg-success shadow-[0_0_0_3px_color-mix(in_oklch,var(--success)_10%,transparent)]" />
						{isFetching ? t("changes.log.updating") : t("changes.log.live")}
					</span>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
				{isLoading && !data ? (
					<div className="flex min-h-32 items-center justify-center text-xs text-fg-mute">
						{t("changes.log.loading")}
					</div>
				) : commits.length === 0 ? (
					<div className="flex min-h-32 items-center justify-center px-4 text-center text-xs text-fg-mute">
						{trimmedFilter
							? t("changes.log.noFilterResults")
							: t("changes.log.empty")}
					</div>
				) : (
					<div className="min-w-0">
						{commits.map((commit, index) => {
							const selected = selectedHash === commit.hash;
							const details = selected ? (
								<div className="overflow-hidden rounded-ds-4 border border-accent-line/30 bg-background/70">
									<div className="flex h-8 items-center border-b border-line/70 px-2 text-[10px] text-fg-mute">
										<span>
											{selectedDiffStats
												? t("changes.log.fileCount", {
														count: selectedDiffStats.files,
													})
												: t("changes.log.changedFiles")}
										</span>
										{selectedDiffStats ? (
											<span className="ml-auto flex gap-2 tabular-nums">
												<span className="text-success">
													+{selectedDiffStats.additions}
												</span>
												<span className="text-danger">
													-{selectedDiffStats.deletions}
												</span>
											</span>
										) : null}
									</div>
									{selectedFilesQuery.isLoading ? (
										<div className="p-3 text-xs text-fg-mute">
											{t("changes.log.loading")}
										</div>
									) : selectedFilesQuery.data?.length ? (
										<div className="px-1">
											<FileList
												files={selectedFilesQuery.data}
												viewMode={fileListViewMode}
												selectedFile={
													selectedFileState?.commitHash === commit.hash
														? selectedFileState.file
														: null
												}
												selectedCommitHash={commit.hash}
												onFileSelect={handleFileSelect}
												worktreePath={worktreePath}
												projectId={projectId}
												category="committed"
												commitHash={commit.hash}
											/>
										</div>
									) : (
										<div className="p-3 text-xs text-fg-mute">
											{t("changes.log.noFiles")}
										</div>
									)}
									<div className="flex h-8 items-center border-t border-line/70 px-2">
										<code className="font-mono text-[10px] text-fg-mute">
											{commit.shortHash}
										</code>
										<Button
											variant="ghost"
											size="sm"
											className="ml-auto h-6 px-2 text-[10px] text-fg-mute"
											onClick={() => copyToClipboard(commit.hash)}
										>
											{t("changes.log.copyHash")}
										</Button>
									</div>
								</div>
							) : undefined;

							return (
								<GitHistoryRow
									key={commit.hash}
									commit={commit}
									selected={selected}
									compact
									currentBranch={currentBranch}
									isFirst={index === 0}
									isLast={index === commits.length - 1}
									details={details}
									onSelect={() => handleCommitSelect(commit.hash)}
									onCopyHash={() => copyToClipboard(commit.hash)}
									onReset={() => {
										setResetTarget({
											hash: commit.hash,
											shortHash: commit.shortHash,
										});
									}}
								/>
							);
						})}
					</div>
				)}

				{canLoadMore && commits.length > 0 ? (
					<div className="flex justify-center p-3">
						<Button
							variant="outline"
							size="sm"
							className="h-7 px-3 text-xs"
							disabled={isFetching}
							onClick={() =>
								setLimit((value) =>
									Math.min(value + PAGE_SIZE, MAX_LOG_RESULTS),
								)
							}
						>
							{isFetching
								? t("changes.log.loading")
								: t("changes.log.loadMore")}
						</Button>
					</div>
				) : null}
			</div>

			{resetTarget ? (
				<ResetToCommitDialog
					open
					onOpenChange={(open) => {
						if (!open) setResetTarget(null);
					}}
					shortHash={resetTarget.shortHash}
					onConfirm={(mode) =>
						resetMutation.mutate({ commit: resetTarget.hash, mode })
					}
					isPending={resetMutation.isPending}
				/>
			) : null}
		</div>
	);
}
