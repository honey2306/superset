import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useDeferredValue, useMemo, useState } from "react";
import { VscChevronDown, VscChevronRight, VscHistory } from "react-icons/vsc";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useChangesStore } from "renderer/stores/changes";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type { ChangedFile } from "shared/changes-types";
import { formatRelativeDate } from "../../utils";
import { FileList } from "../FileList";
import type { ResetMode } from "../ResetToCommitDialog";
import { ResetToCommitDialog } from "../ResetToCommitDialog";

const PAGE_SIZE = 50;

interface LogViewProps {
	worktreePath: string;
	workspaceId: string;
	projectId?: string;
	onRefresh?: () => void;
}

export function LogView({
	worktreePath,
	workspaceId,
	projectId,
	onRefresh,
}: LogViewProps) {
	const { t } = useTranslation();
	const { copyToClipboard } = useCopyToClipboard();
	const utils = electronTrpc.useUtils();
	const [filter, setFilter] = useState("");
	const deferredFilter = useDeferredValue(filter);
	const trimmedFilter = deferredFilter.trim();
	const [limit, setLimit] = useState(PAGE_SIZE);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [resetTarget, setResetTarget] = useState<{
		hash: string;
		shortHash: string;
	} | null>(null);

	const selectFile = useChangesStore((s) => s.selectFile);
	const selectedFileState = useChangesStore((s) =>
		s.getSelectedFile(workspaceId),
	);
	const fileListViewMode = useChangesStore((s) => s.fileListViewMode);

	const { data, isLoading, isFetching } = electronTrpc.changes.listLog.useQuery(
		{
			worktreePath,
			limit,
			grep: trimmedFilter || undefined,
			author: undefined,
		},
		{
			enabled: !!worktreePath,
			staleTime: 5_000,
		},
	);

	const commits = data ?? [];

	const resetMutation = electronTrpc.changes.resetToCommit.useMutation({
		onSuccess: () => {
			toast.success(
				t("v1Changes.reset.toastDone", {
					commit: resetTarget?.shortHash ?? "",
				}),
			);
			void utils.changes.listLog.invalidate({ worktreePath });
			void utils.changes.getStatus.invalidate({ worktreePath });
			void utils.changes.getBranches.invalidate({ worktreePath });
			setResetTarget(null);
			onRefresh?.();
		},
		onError: (error) => {
			toast.error(t("v1Changes.reset.toastFailed", { message: error.message }));
		},
	});

	const handleReset = (mode: ResetMode) => {
		if (!resetTarget) return;
		resetMutation.mutate({
			worktreePath,
			commit: resetTarget.hash,
			mode,
		});
	};

	const handleToggle = (hash: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(hash)) next.delete(hash);
			else next.add(hash);
			return next;
		});
	};

	const handleFileSelect = (file: ChangedFile, commitHash: string) => {
		if (!worktreePath) return;
		selectFile(
			workspaceId,
			toAbsoluteWorkspacePath(worktreePath, file.path),
			file,
			"committed",
			commitHash,
		);
	};

	const canLoadMore = commits.length >= limit;

	const rows = useMemo(() => commits, [commits]);

	return (
		<div className="flex flex-1 min-h-0 flex-col">
			<div className="px-2 py-1.5 border-b">
				<Input
					value={filter}
					onChange={(e) => {
						setFilter(e.target.value);
						setLimit(PAGE_SIZE);
					}}
					placeholder={t("v1Changes.log.filterPlaceholder")}
					className="h-7 text-xs"
				/>
			</div>
			{isLoading && rows.length === 0 ? (
				<div className="flex flex-1 items-center justify-center text-xs text-fg-mute">
					{t("v1Changes.log.loading")}
				</div>
			) : rows.length === 0 ? (
				<div className="flex flex-1 items-center justify-center text-xs text-fg-mute">
					{t("v1Changes.log.empty")}
				</div>
			) : (
				<div className="flex-1 overflow-y-auto" data-changes-scroll-container>
					{rows.map((commit) => (
						<LogRow
							key={commit.hash}
							commit={commit}
							isExpanded={expanded.has(commit.hash)}
							onToggle={() => handleToggle(commit.hash)}
							onCopyHash={() => copyToClipboard(commit.hash)}
							onReset={() =>
								setResetTarget({
									hash: commit.hash,
									shortHash: commit.shortHash,
								})
							}
							worktreePath={worktreePath}
							projectId={projectId}
							viewMode={fileListViewMode}
							selectedFile={selectedFileState?.file ?? null}
							selectedCommitHash={selectedFileState?.commitHash ?? null}
							onFileSelect={handleFileSelect}
						/>
					))}
					{canLoadMore && (
						<div className="flex justify-center p-2">
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-3 text-xs"
								disabled={isFetching}
								onClick={() => setLimit((n) => n + PAGE_SIZE)}
							>
								{t("v1Changes.log.loadMore")}
							</Button>
						</div>
					)}
				</div>
			)}
			{resetTarget && (
				<ResetToCommitDialog
					open
					onOpenChange={(open) => {
						if (!open) setResetTarget(null);
					}}
					shortHash={resetTarget.shortHash}
					onConfirm={handleReset}
					isPending={resetMutation.isPending}
				/>
			)}
		</div>
	);
}

interface LogRowProps {
	commit: {
		hash: string;
		shortHash: string;
		message: string;
		author: string;
		date: number;
	};
	isExpanded: boolean;
	onToggle: () => void;
	onCopyHash: () => void;
	onReset: () => void;
	worktreePath: string;
	projectId?: string;
	viewMode: "grouped" | "tree";
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	onFileSelect: (file: ChangedFile, commitHash: string) => void;
}

function LogRow({
	commit,
	isExpanded,
	onToggle,
	onCopyHash,
	onReset,
	worktreePath,
	projectId,
	viewMode,
	selectedFile,
	selectedCommitHash,
	onFileSelect,
}: LogRowProps) {
	const { t } = useTranslation();
	const { data: files } = electronTrpc.changes.getCommitFiles.useQuery(
		{ worktreePath, commitHash: commit.hash },
		{ enabled: isExpanded, staleTime: 60_000 },
	);
	const isCommitSelected = selectedCommitHash === commit.hash;

	return (
		<div>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<button
						type="button"
						onClick={onToggle}
						className={cn(
							"group w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-hover rounded-sm",
							isCommitSelected && "bg-accent-tint",
						)}
					>
						{isExpanded ? (
							<VscChevronDown className="size-3 shrink-0 text-fg-mute" />
						) : (
							<VscChevronRight className="size-3 shrink-0 text-fg-mute" />
						)}
						<span className="text-[10px] font-mono text-fg-mute shrink-0">
							{commit.shortHash}
						</span>
						<span className="text-xs flex-1 truncate">{commit.message}</span>
						<span className="text-[10px] text-fg-mute shrink-0">
							{formatRelativeDate(new Date(commit.date), t)}
						</span>
					</button>
				</ContextMenuTrigger>
				<ContextMenuContent className="w-56">
					<ContextMenuItem onClick={onCopyHash}>
						{t("v1Changes.log.copyHash")}
					</ContextMenuItem>
					<ContextMenuItem onClick={onReset}>
						<VscHistory className="mr-2 size-4" />
						{t("v1Changes.log.resetHere")}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
			{isExpanded && files && files.length > 0 && (
				<div className="ml-4 pl-1.5 border-l border-line">
					<FileList
						files={files}
						viewMode={viewMode}
						selectedFile={isCommitSelected ? selectedFile : null}
						selectedCommitHash={selectedCommitHash}
						onFileSelect={(file) => onFileSelect(file, commit.hash)}
						worktreePath={worktreePath}
						projectId={projectId}
						category="committed"
						commitHash={commit.hash}
					/>
				</div>
			)}
		</div>
	);
}
