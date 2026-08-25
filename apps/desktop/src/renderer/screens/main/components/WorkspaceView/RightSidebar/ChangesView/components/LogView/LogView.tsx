import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import {
	LuFileText,
	LuGitBranch,
	LuGitCommitHorizontal,
	LuSearch,
} from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useChangesStore } from "renderer/stores/changes";
import { useSidebarStore } from "renderer/stores/sidebar-state";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type { ChangedFile } from "shared/changes-types";
import { FileList } from "../FileList";
import type { ResetMode } from "../ResetToCommitDialog";
import { ResetToCommitDialog } from "../ResetToCommitDialog";
import {
	type CommitDiffStats,
	type GitHistoryEntry,
	GitHistoryRow,
	RefBadges,
} from "./GitHistoryRow";

const PAGE_SIZE = 50;

interface LogViewProps {
	worktreePath: string;
	workspaceId: string;
	projectId?: string;
	onFileOpen?: (file: ChangedFile, commitHash: string) => void;
	onRefresh?: () => void;
}

export function LogView({
	worktreePath,
	workspaceId,
	projectId,
	onFileOpen,
	onRefresh,
}: LogViewProps) {
	const { t } = useTranslation();
	const { copyToClipboard } = useCopyToClipboard();
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const sidebarWidth = useSidebarStore((state) => state.sidebarWidth);
	const compact = sidebarWidth < 380;
	const [filter, setFilter] = useState("");
	const deferredFilter = useDeferredValue(filter);
	const trimmedFilter = deferredFilter.trim();
	const [limit, setLimit] = useState(PAGE_SIZE);
	const [allBranches, setAllBranches] = useState(true);
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
		enabled: Boolean(activeHostUrl && workspaceId),
		queryFn: async () => {
			if (!activeHostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(activeHostUrl).git.listLog.query({
				workspaceId,
				limit,
				skip: 0,
				grep: trimmedFilter || undefined,
				author: undefined,
				all: allBranches,
			});
		},
		staleTime: 5_000,
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
			commits.find((entry) =>
				entry.refs.some((ref) => ref.startsWith("HEAD -> ")),
			)?.branch ??
			commits.find((entry) => entry.branch)?.branch ??
			"HEAD",
		[commits],
	);
	const entriesByHash = useMemo(
		() => new Map(commits.map((entry) => [entry.hash, entry])),
		[commits],
	);
	const selectedCommit = selectedHash
		? (entriesByHash.get(selectedHash) ?? null)
		: null;

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

	const canLoadMore = commits.length >= limit;
	const resultCount = `${commits.length}${canLoadMore ? "+" : ""}`;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="shrink-0 border-b border-line/60 bg-surface/40 px-2 py-1.5">
				<div className="flex min-w-0 items-center gap-1.5">
					<div className="relative min-w-0 flex-1">
						<LuSearch className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-fg-faint" />
						<Input
							value={filter}
							onChange={(event) => {
								setFilter(event.target.value);
								setLimit(PAGE_SIZE);
								setSelectedHash(null);
							}}
							placeholder={t("changes.log.filterPlaceholder")}
							className="h-7 bg-surface pl-7 text-xs"
						/>
					</div>
					<span
						className={cn(
							"shrink-0 text-[10px] tabular-nums text-fg-faint",
							isFetching && "text-fg-mute",
						)}
						title={t("changes.log.commitCount", { count: resultCount })}
					>
						{resultCount}
					</span>
					{!compact ? (
						<Button
							variant="outline"
							size="sm"
							className="h-7 max-w-[132px] min-w-0 px-2 text-[10px]"
							aria-pressed={allBranches}
							title={t(
								allBranches
									? "changes.log.switchToCurrentBranch"
									: "changes.log.switchToAllBranches",
							)}
							onClick={() => {
								setAllBranches((value) => !value);
								setLimit(PAGE_SIZE);
								setSelectedHash(null);
							}}
						>
							<LuGitBranch className="size-3 shrink-0" />
							<span className="truncate">
								{allBranches ? t("changes.log.allBranches") : currentBranch}
							</span>
						</Button>
					) : null}
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
				{isLoading && !data ? (
					<div className="flex min-h-32 items-center justify-center text-xs text-fg-mute">
						{t("changes.log.loading")}
					</div>
				) : commits.length === 0 ? (
					<div className="flex min-h-32 items-center justify-center text-xs text-fg-mute">
						{t("changes.log.empty")}
					</div>
				) : (
					<div className="min-w-0 py-1">
						{commits.map((commit) => (
							<GitHistoryRow
								key={commit.hash}
								commit={commit}
								selected={selectedHash === commit.hash}
								compact={compact}
								currentBranch={currentBranch}
								stats={
									selectedHash === commit.hash ? selectedDiffStats : undefined
								}
								onSelect={() => setSelectedHash(commit.hash)}
								onCopyHash={() => copyToClipboard(commit.hash)}
								onReset={() => {
									setResetTarget({
										hash: commit.hash,
										shortHash: commit.shortHash,
									});
								}}
							/>
						))}
					</div>
				)}
				{canLoadMore && commits.length > 0 ? (
					<div className="flex justify-center p-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							disabled={isFetching}
							onClick={() => setLimit((value) => value + PAGE_SIZE)}
						>
							{t("changes.log.loadMore")}
						</Button>
					</div>
				) : null}
			</div>

			{selectedCommit ? (
				<section className="max-h-[44%] min-h-0 shrink-0 overflow-y-auto border-t border-line bg-background">
					<div className="flex items-center gap-1.5 border-b border-line px-2 py-1.5">
						<LuGitCommitHorizontal className="size-3.5 shrink-0 text-accent-solid" />
						<span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-mute">
							{t("changes.log.commitDetails")}
						</span>
						<span className="ml-auto shrink-0 font-mono text-[10px] text-fg-mute">
							{selectedCommit.shortHash}
						</span>
					</div>
					<div className="space-y-2 border-b border-line/70 px-2 py-2">
						<p
							className="line-clamp-2 text-xs font-medium leading-4"
							title={selectedCommit.message}
						>
							{selectedCommit.message}
						</p>
						<div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[10px]">
							<span className="text-fg-faint">{t("changes.log.hash")}</span>
							<code
								className="min-w-0 break-all font-mono text-fg-mute"
								title={selectedCommit.hash}
							>
								{selectedCommit.hash}
							</code>
							<span className="text-fg-faint">{t("changes.log.author")}</span>
							<span
								className="truncate text-fg-mute"
								title={selectedCommit.author}
							>
								{selectedCommit.author || "—"}
							</span>
							<span className="text-fg-faint">{t("changes.log.date")}</span>
							<span
								className="truncate text-fg-mute"
								title={new Date(selectedCommit.date).toLocaleString()}
							>
								{selectedCommit.date
									? new Date(selectedCommit.date).toLocaleString()
									: "—"}
							</span>
							<span className="text-fg-faint">{t("changes.log.refs")}</span>
							<RefBadges
								original={selectedCommit}
								currentBranch={currentBranch}
								compact={false}
								includeBranchFallback
							/>
						</div>
					</div>
					<div className="flex items-center gap-1.5 border-b border-line/70 px-2 py-1.5">
						<LuFileText className="size-3.5 shrink-0 text-fg-mute" />
						<span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-mute">
							{t("changes.log.changedFiles")}
						</span>
						{selectedDiffStats ? (
							<span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[9px] tabular-nums">
								<span className="text-success">
									+{selectedDiffStats.additions}
								</span>
								<span className="text-danger">
									-{selectedDiffStats.deletions}
								</span>
								<span className="text-fg-faint">{selectedDiffStats.files}</span>
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
									selectedFileState?.commitHash === selectedCommit.hash
										? selectedFileState.file
										: null
								}
								selectedCommitHash={selectedCommit.hash}
								onFileSelect={handleFileSelect}
								worktreePath={worktreePath}
								projectId={projectId}
								category="committed"
								commitHash={selectedCommit.hash}
							/>
						</div>
					) : (
						<div className="flex items-center gap-1.5 p-3 text-xs text-fg-mute">
							<LuFileText className="size-3.5" />
							{t("changes.log.noFiles")}
						</div>
					)}
				</section>
			) : null}

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
