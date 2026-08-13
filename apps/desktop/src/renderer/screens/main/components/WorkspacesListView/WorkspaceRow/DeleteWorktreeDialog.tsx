import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getWorkspaceCreationBranchesQueryKey } from "renderer/hooks/host-workspaces/useWorkspaceCreationBranches";
import {
	disposeHostSessionsForWorktreePath,
	toastDisposeFailures,
} from "renderer/lib/dispose-host-sessions";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";

interface DeleteWorktreeDialogProps {
	projectId: string;
	/** Live git worktree path; used to remove it via host. */
	worktreePath: string;
	worktreeName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/**
 * Confirmation for removing an orphan git worktree — one that exists on disk
 * with no matching Catalog workspace on this host (e.g. left behind by a v1
 * session, or added manually with `git worktree add`). The host-side
 * `workspaceCleanup.destroyOrphanWorktree` procedure enforces that the path
 * really is an orphan before running `git worktree remove --force --force`.
 */
export function DeleteWorktreeDialog({
	projectId,
	worktreePath,
	worktreeName,
	open,
	onOpenChange,
}: DeleteWorktreeDialogProps) {
	const { activeHostUrl } = useLocalHostService();
	const utils = electronTrpc.useUtils();
	const queryClient = useQueryClient();

	const destroy = useMutation({
		mutationFn: async () => {
			if (!activeHostUrl) {
				throw new Error("Host service is not connected");
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).workspaceCleanup.destroyOrphanWorktree.mutate({
				projectId,
				worktreePath,
			});
		},
		onSuccess: async () => {
			// Best-effort: dispose any host-service terminals that were still
			// backgrounded against this worktree path.
			const retryDispose = () =>
				disposeHostSessionsForWorktreePath(utils, worktreePath);
			void retryDispose().then((result) =>
				toastDisposeFailures(result, retryDispose),
			);
			await queryClient.invalidateQueries({
				queryKey: getWorkspaceCreationBranchesQueryKey({
					projectId,
					hostUrl: activeHostUrl,
					filter: "worktree",
					query: "",
				}),
			});
		},
	});

	const handleDelete = async () => {
		const toastId = toast.loading(`Deleting "${worktreeName}"...`);
		onOpenChange(false);
		try {
			await destroy.mutateAsync();
			toast.success(`Deleted "${worktreeName}"`, { id: toastId });
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to delete worktree",
				{ id: toastId },
			);
		}
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Delete worktree "{worktreeName}"?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="text-fg-mute space-y-1.5">
							<span className="block">
								This will permanently delete the worktree and its files from
								disk.
							</span>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Tooltip delayDuration={400}>
						<TooltipTrigger asChild>
							<Button
								variant="destructive"
								size="sm"
								className="h-7 px-3 text-xs"
								onClick={handleDelete}
								disabled={destroy.isPending || !activeHostUrl}
							>
								Delete
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs max-w-[200px]">
							Permanently delete worktree from disk.
						</TooltipContent>
					</Tooltip>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
