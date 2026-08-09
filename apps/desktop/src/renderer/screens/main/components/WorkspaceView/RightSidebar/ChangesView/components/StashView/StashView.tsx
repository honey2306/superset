import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	VscChevronDown,
	VscChevronRight,
	VscEllipsis,
	VscGitStashApply,
	VscTrash,
} from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { formatRelativeDate } from "../../utils";
import { DiscardConfirmDialog } from "../DiscardConfirmDialog";

interface StashViewProps {
	worktreePath: string;
	onRefresh?: () => void;
}

export function StashView({ worktreePath, onRefresh }: StashViewProps) {
	const { t } = useTranslation();
	const utils = electronTrpc.useUtils();
	const [expanded, setExpanded] = useState<Set<number>>(new Set());
	const [dropTarget, setDropTarget] = useState<number | null>(null);

	const { data, isLoading } = electronTrpc.changes.stashList.useQuery(
		{ worktreePath },
		{ enabled: !!worktreePath, staleTime: 5_000 },
	);

	const stashes = data ?? [];

	const invalidateAll = () => {
		void utils.changes.stashList.invalidate({ worktreePath });
		void utils.changes.getStatus.invalidate({ worktreePath });
		onRefresh?.();
	};

	const applyMutation = electronTrpc.changes.stashApplyAt.useMutation({
		onSuccess: () => {
			toast.success(t("v1Changes.stashes.toastApplied"));
			invalidateAll();
		},
		onError: (error) =>
			toast.error(
				t("v1Changes.stashes.toastApplyFailed", { message: error.message }),
			),
	});
	const popMutation = electronTrpc.changes.stashPopAt.useMutation({
		onSuccess: () => {
			toast.success(t("v1Changes.stashes.toastPopped"));
			invalidateAll();
		},
		onError: (error) =>
			toast.error(
				t("v1Changes.stashes.toastPopFailed", { message: error.message }),
			),
	});
	const dropMutation = electronTrpc.changes.stashDropAt.useMutation({
		onSuccess: () => {
			toast.success(t("v1Changes.stashes.toastDropped"));
			setDropTarget(null);
			invalidateAll();
		},
		onError: (error) =>
			toast.error(
				t("v1Changes.stashes.toastDropFailed", { message: error.message }),
			),
	});

	const handleToggle = (index: number) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			return next;
		});
	};

	if (isLoading && stashes.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
				{t("v1Changes.stashes.loading")}
			</div>
		);
	}

	if (stashes.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
				{t("v1Changes.stashes.empty")}
			</div>
		);
	}

	return (
		<>
			<div className="flex-1 overflow-y-auto">
				{stashes.map((entry) => {
					const isExpanded = expanded.has(entry.index);
					const isPending =
						(applyMutation.isPending &&
							applyMutation.variables?.index === entry.index) ||
						(popMutation.isPending &&
							popMutation.variables?.index === entry.index);
					return (
						<div
							key={entry.ref}
							className="border-b border-border/40 last:border-b-0"
						>
							<div
								className={cn(
									"group flex items-center gap-1.5 px-2 py-1.5 hover:bg-accent/50",
									isPending && "opacity-60",
								)}
							>
								<button
									type="button"
									onClick={() => handleToggle(entry.index)}
									className="flex flex-1 min-w-0 items-center gap-1.5 text-left"
								>
									{isExpanded ? (
										<VscChevronDown className="size-3 shrink-0 text-muted-foreground" />
									) : (
										<VscChevronRight className="size-3 shrink-0 text-muted-foreground" />
									)}
									<span className="text-[10px] font-mono text-muted-foreground shrink-0">
										{entry.ref}
									</span>
									<span className="text-xs flex-1 truncate">
										{entry.message}
									</span>
									{entry.timestamp > 0 && (
										<span className="text-[10px] text-muted-foreground shrink-0">
											{formatRelativeDate(new Date(entry.timestamp), t)}
										</span>
									)}
								</button>
								<div className="flex items-center gap-0.5">
									<Button
										variant="ghost"
										size="sm"
										className="h-6 px-2 text-[11px]"
										disabled={isPending}
										onClick={() =>
											applyMutation.mutate({
												worktreePath,
												index: entry.index,
											})
										}
									>
										{t("v1Changes.stashes.apply")}
									</Button>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="size-6"
												aria-label={t("v1Changes.stashes.moreActions")}
											>
												<VscEllipsis className="size-3.5" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end" className="w-40">
											<DropdownMenuItem
												onClick={() =>
													popMutation.mutate({
														worktreePath,
														index: entry.index,
													})
												}
												className="text-xs"
											>
												<VscGitStashApply className="mr-2 size-4" />
												{t("v1Changes.stashes.pop")}
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() => setDropTarget(entry.index)}
												className="text-xs text-destructive focus:text-destructive"
											>
												<VscTrash className="mr-2 size-4" />
												{t("v1Changes.stashes.drop")}
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>
							{isExpanded && (
								<StashFilesList
									worktreePath={worktreePath}
									index={entry.index}
								/>
							)}
						</div>
					);
				})}
			</div>
			<DiscardConfirmDialog
				open={dropTarget !== null}
				onOpenChange={(open) => {
					if (!open) setDropTarget(null);
				}}
				title={t("v1Changes.stashes.dropTitle")}
				description={t("v1Changes.stashes.dropDesc")}
				onConfirm={() => {
					if (dropTarget !== null) {
						dropMutation.mutate({ worktreePath, index: dropTarget });
					}
				}}
				confirmLabel={t("v1Changes.stashes.drop")}
				confirmDisabled={dropMutation.isPending}
			/>
		</>
	);
}

function StashFilesList({
	worktreePath,
	index,
}: {
	worktreePath: string;
	index: number;
}) {
	const { data: files } = electronTrpc.changes.stashFiles.useQuery(
		{ worktreePath, index },
		{ staleTime: 60_000 },
	);
	if (!files || files.length === 0) return null;
	return (
		<div className="ml-4 pl-1.5 border-l border-border pb-1">
			{files.map((f) => (
				<div
					key={f.path}
					className="flex items-center gap-1.5 px-2 py-0.5 text-xs"
				>
					<span className="text-[10px] font-mono text-muted-foreground shrink-0 w-4">
						{f.status}
					</span>
					<span className="truncate">{f.path}</span>
				</div>
			))}
		</div>
	);
}
