import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { cn } from "@superset/ui/utils";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { formatRelativeDate } from "../../utils";

interface FileHistoryDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	worktreePath: string;
	filePath: string;
	onSelectCommit: (commitHash: string) => void;
	selectedCommitHash?: string | null;
}

export function FileHistoryDialog({
	open,
	onOpenChange,
	worktreePath,
	filePath,
	onSelectCommit,
	selectedCommitHash,
}: FileHistoryDialogProps) {
	const { t } = useTranslation();
	const { data, isLoading } = electronTrpc.changes.getFileHistory.useQuery(
		{ worktreePath, filePath, limit: 100 },
		{ enabled: open && !!worktreePath && !!filePath },
	);

	const commits = data ?? [];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[560px] gap-0 p-0">
				<DialogHeader className="px-4 pt-4 pb-2">
					<DialogTitle className="font-medium text-sm">
						{t("v1Changes.fileHistory.title", { file: filePath })}
					</DialogTitle>
				</DialogHeader>
				<div className="max-h-[420px] min-h-[240px] overflow-y-auto border-t">
					{isLoading && commits.length === 0 ? (
						<div className="flex h-40 items-center justify-center text-xs text-fg-mute">
							{t("v1Changes.fileHistory.loading")}
						</div>
					) : commits.length === 0 ? (
						<div className="flex h-40 items-center justify-center text-xs text-fg-mute">
							{t("v1Changes.fileHistory.empty")}
						</div>
					) : (
						<div>
							{commits.map((commit) => {
								const isSelected = selectedCommitHash === commit.hash;
								return (
									<button
										key={commit.hash}
										type="button"
										onClick={() => {
											onSelectCommit(commit.hash);
											onOpenChange(false);
										}}
										className={cn(
											"w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-hover",
											isSelected && "bg-accent-tint",
										)}
									>
										<span className="text-[10px] font-mono text-fg-mute shrink-0">
											{commit.shortHash}
										</span>
										<span className="text-xs flex-1 truncate">
											{commit.message}
										</span>
										<span className="text-[10px] text-fg-mute shrink-0 truncate max-w-[100px]">
											{commit.author}
										</span>
										{commit.date > 0 && (
											<span className="text-[10px] text-fg-mute shrink-0">
												{formatRelativeDate(new Date(commit.date), t)}
											</span>
										)}
									</button>
								);
							})}
						</div>
					)}
				</div>
				<div className="flex justify-end px-4 py-2 border-t">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						{t("v1Changes.fileHistory.close")}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
