import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import {
	VscChevronDown,
	VscChevronRight,
	VscEllipsis,
	VscGitStashApply,
	VscTrash,
} from "react-icons/vsc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { formatRelativeDate } from "../../utils";
import { DiscardConfirmDialog } from "../DiscardConfirmDialog";

interface StashViewProps {
	worktreePath: string;
	onRefresh?: () => void;
}

export function StashView({ onRefresh }: StashViewProps) {
	const { t } = useTranslation();
	const { workspaceId } = useParams({ strict: false });
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const [expanded, setExpanded] = useState<Set<number>>(new Set());
	const [dropTarget, setDropTarget] = useState<number | null>(null);

	const stashListQueryKey = [
		"git-stash-list",
		activeHostUrl,
		workspaceId,
	] as const;
	const { data, isLoading } = useQuery({
		queryKey: stashListQueryKey,
		enabled: Boolean(activeHostUrl && workspaceId),
		queryFn: () => {
			if (!activeHostUrl || !workspaceId) {
				throw new Error("Workspace host is unavailable");
			}
			return getHostServiceClientByUrl(activeHostUrl).git.stashList.query({
				workspaceId,
			});
		},
		staleTime: 5_000,
	});

	const stashes = data ?? [];

	const invalidateAll = () => {
		void queryClient.invalidateQueries({ queryKey: stashListQueryKey });
		onRefresh?.();
	};

	const applyMutation = useMutation({
		mutationFn: ({ index }: { index: number }) => {
			if (!activeHostUrl || !workspaceId) {
				throw new Error("Workspace host is unavailable");
			}
			return getHostServiceClientByUrl(activeHostUrl).git.stashApplyAt.mutate({
				workspaceId,
				index,
			});
		},
		onSuccess: () => {
			toast.success(t("changes.stashes.toastApplied"));
			invalidateAll();
		},
		onError: (error) =>
			toast.error(
				t("changes.stashes.toastApplyFailed", { message: error.message }),
			),
	});
	const popMutation = useMutation({
		mutationFn: ({ index }: { index: number }) => {
			if (!activeHostUrl || !workspaceId) {
				throw new Error("Workspace host is unavailable");
			}
			return getHostServiceClientByUrl(activeHostUrl).git.stashPopAt.mutate({
				workspaceId,
				index,
			});
		},
		onSuccess: () => {
			toast.success(t("changes.stashes.toastPopped"));
			invalidateAll();
		},
		onError: (error) =>
			toast.error(
				t("changes.stashes.toastPopFailed", { message: error.message }),
			),
	});
	const dropMutation = useMutation({
		mutationFn: ({ index }: { index: number }) => {
			if (!activeHostUrl || !workspaceId) {
				throw new Error("Workspace host is unavailable");
			}
			return getHostServiceClientByUrl(activeHostUrl).git.stashDropAt.mutate({
				workspaceId,
				index,
			});
		},
		onSuccess: () => {
			toast.success(t("changes.stashes.toastDropped"));
			setDropTarget(null);
			invalidateAll();
		},
		onError: (error) =>
			toast.error(
				t("changes.stashes.toastDropFailed", { message: error.message }),
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
			<div className="flex flex-1 items-center justify-center text-xs text-fg-mute">
				{t("changes.stashes.loading")}
			</div>
		);
	}

	if (stashes.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center text-xs text-fg-mute">
				{t("changes.stashes.empty")}
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
							className="border-b border-line/40 last:border-b-0"
						>
							<div
								className={cn(
									"group flex items-center gap-1.5 px-2 py-1.5 hover:bg-hover",
									isPending && "opacity-60",
								)}
							>
								<button
									type="button"
									onClick={() => handleToggle(entry.index)}
									className="flex flex-1 min-w-0 items-center gap-1.5 text-left"
								>
									{isExpanded ? (
										<VscChevronDown className="size-3 shrink-0 text-fg-mute" />
									) : (
										<VscChevronRight className="size-3 shrink-0 text-fg-mute" />
									)}
									<span className="text-[10px] font-mono text-fg-mute shrink-0">
										{entry.ref}
									</span>
									<span className="text-xs flex-1 truncate">
										{entry.message}
									</span>
									{entry.timestamp > 0 && (
										<span className="text-[10px] text-fg-mute shrink-0">
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
										onClick={() => applyMutation.mutate({ index: entry.index })}
									>
										{t("changes.stashes.apply")}
									</Button>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="size-6"
												aria-label={t("changes.stashes.moreActions")}
											>
												<VscEllipsis className="size-3.5" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end" className="w-40">
											<DropdownMenuItem
												onClick={() =>
													popMutation.mutate({ index: entry.index })
												}
												className="text-xs"
											>
												<VscGitStashApply className="mr-2 size-4" />
												{t("changes.stashes.pop")}
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() => setDropTarget(entry.index)}
												className="text-xs text-destructive focus:text-destructive"
											>
												<VscTrash className="mr-2 size-4" />
												{t("changes.stashes.drop")}
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>
							{isExpanded && (
								<StashFilesList
									workspaceId={workspaceId ?? ""}
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
				title={t("changes.stashes.dropTitle")}
				description={t("changes.stashes.dropDesc")}
				onConfirm={() => {
					if (dropTarget !== null) {
						dropMutation.mutate({ index: dropTarget });
					}
				}}
				confirmLabel={t("changes.stashes.drop")}
				confirmDisabled={dropMutation.isPending}
			/>
		</>
	);
}

function StashFilesList({
	workspaceId,
	index,
}: {
	workspaceId: string;
	index: number;
}) {
	const { activeHostUrl } = useLocalHostService();
	const { data: files } = useQuery({
		queryKey: ["git-stash-files", activeHostUrl, workspaceId, index],
		enabled: Boolean(activeHostUrl && workspaceId),
		queryFn: () => {
			if (!activeHostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(activeHostUrl).git.stashFiles.query({
				workspaceId,
				index,
			});
		},
		staleTime: 60_000,
	});
	if (!files || files.length === 0) return null;
	return (
		<div className="ml-4 pl-1.5 border-l border-line pb-1">
			{files.map((f) => (
				<div
					key={f.path}
					className="flex items-center gap-1.5 px-2 py-0.5 text-xs"
				>
					<span className="text-[10px] font-mono text-fg-mute shrink-0 w-4">
						{f.status}
					</span>
					<span className="truncate">{f.path}</span>
				</div>
			))}
		</div>
	);
}
