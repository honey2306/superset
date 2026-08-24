import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { Label } from "@superset/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDestroyWorkspace } from "renderer/hooks/host-service/useDestroyWorkspace/useDestroyWorkspace";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { deleteWithToast } from "renderer/routes/_local/components/TeardownLogsDialog";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { focusPrimaryDialogAction } from "./focus-primary-dialog-action";

interface DeleteWorkspaceDialogProps {
	workspaceId: string;
	workspaceName: string;
	workspaceType?: "worktree" | "branch";
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function DeleteWorkspaceDialog({
	workspaceId,
	workspaceName,
	workspaceType = "worktree",
	open,
	onOpenChange,
}: DeleteWorkspaceDialogProps) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const params = useParams({ strict: false });
	const isBranch = workspaceType === "branch";
	const destroyWorkspace = useDestroyWorkspace(workspaceId);
	const { activeHostUrl } = useLocalHostService();
	const ownerHostUrl =
		destroyWorkspace.hostTarget.status === "ready"
			? destroyWorkspace.hostTarget.url
			: destroyWorkspace.hostTarget.status === "not-found"
				? activeHostUrl
				: null;
	const ownerHostReady = ownerHostUrl !== null;
	const hostInspectQuery = useQuery({
		queryKey: ["workspace-cleanup-inspect", ownerHostUrl, workspaceId],
		enabled: open && ownerHostReady,
		queryFn: () => destroyWorkspace.inspect(),
	});
	const setDeleteLocalBranchSetting =
		electronTrpc.settings.setDeleteLocalBranch.useMutation();

	const { data: deleteLocalBranchDefault } =
		electronTrpc.settings.getDeleteLocalBranch.useQuery(undefined, {
			enabled: open && !isBranch,
		});
	const [deleteLocalBranch, setDeleteLocalBranch] = useState<boolean | null>(
		null,
	);
	const closeActionButtonRef = useRef<HTMLButtonElement | null>(null);
	const deleteLocalBranchChecked =
		deleteLocalBranch ?? deleteLocalBranchDefault ?? false;

	const canDeleteData = hostInspectQuery.data;
	const isLoading = !ownerHostReady || hostInspectQuery.isLoading;

	const handleDelete = useCallback(async () => {
		onOpenChange(false);

		setDeleteLocalBranchSetting.mutate({
			enabled: deleteLocalBranchChecked,
		});

		const deleteFn = () =>
			destroyWorkspace.destroy({
				deleteBranch: deleteLocalBranchChecked,
				force: false,
			});
		const forceDeleteFn = () =>
			destroyWorkspace.destroy({
				deleteBranch: deleteLocalBranchChecked,
				force: true,
			});
		const deleted = await deleteWithToast({
			name: workspaceName,
			deleteFn,
			forceDeleteFn,
		});
		if (deleted && params.workspaceId === workspaceId) {
			void navigate({ to: "/workspace" });
		}
	}, [
		onOpenChange,
		setDeleteLocalBranchSetting,
		deleteLocalBranchChecked,
		workspaceName,
		workspaceId,
		destroyWorkspace,
		navigate,
		params.workspaceId,
	]);

	const canDelete = canDeleteData?.canDelete ?? true;
	const reason = canDeleteData?.reason;
	const hasChanges = canDeleteData?.hasChanges ?? false;
	const hasUnpushedCommits = canDeleteData?.hasUnpushedCommits ?? false;
	const hasWarnings = hasChanges || hasUnpushedCommits;
	const deletionBlockedByChanges = hasChanges;
	const canConfirmDelete = canDelete && !deletionBlockedByChanges;

	// Handle Enter key press to trigger deletion. Local/main workspaces never
	// reach this dialog from the sidebar; the fail-closed return below protects
	// stale/deep-link callers too.
	useEffect(() => {
		if (!open) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.key === "Enter" &&
				!event.shiftKey &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey
			) {
				event.preventDefault();

				if (canConfirmDelete && !isLoading) {
					handleDelete();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [open, canConfirmDelete, isLoading, handleDelete]);

	// Main/local workspaces are never deletable. Keep this component fail-closed
	// for stale callers even though the sidebar hides their close affordance.
	if (isBranch) return null;

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent
				className="max-w-[340px] gap-0 p-0"
				onOpenAutoFocus={(event) => {
					focusPrimaryDialogAction(event, closeActionButtonRef.current);
				}}
			>
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						{t("workspace.removeNamedQuestion", { name: workspaceName })}
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="text-fg-mute space-y-1.5">
							{isLoading ? (
								t("workspace.checkingStatus")
							) : !canDelete ? (
								<span className="text-destructive">{reason}</span>
							) : hasChanges ? (
								<span className="text-warning">
									{t("workspace.deleteBlockedChanges")}
								</span>
							) : (
								<span className="block">
									{t("workspace.removeDescription")}
								</span>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				{!isLoading && canDelete && hasWarnings && (
					<div className="px-4 pb-2">
						<div className="text-xs text-warning bg-warning-tint border border-warning/25 rounded-ds-3 px-2.5 py-1.5">
							{hasChanges && hasUnpushedCommits
								? t("workspace.hasChangesAndUnpushed")
								: hasChanges
									? t("workspace.hasChanges")
									: t("workspace.hasUnpushed")}
						</div>
					</div>
				)}

				{!isLoading && canDelete && (
					<div className="px-4 pb-2">
						<div className="flex items-center gap-2">
							<Checkbox
								id="delete-local-branch"
								checked={deleteLocalBranchChecked}
								onCheckedChange={(checked) =>
									setDeleteLocalBranch(checked === true)
								}
							/>
							<Label
								htmlFor="delete-local-branch"
								className="text-xs text-fg-mute cursor-pointer select-none"
							>
								{t("workspace.deleteLocalBranch")}
							</Label>
						</div>
					</div>
				)}

				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						{t("common.cancel")}
					</Button>
					<Tooltip delayDuration={400}>
						<TooltipTrigger asChild>
							<Button
								ref={closeActionButtonRef}
								variant="destructive"
								size="sm"
								className="h-7 px-3 text-xs"
								onClick={handleDelete}
								disabled={!canConfirmDelete || isLoading}
							>
								{t("common.delete")}
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs max-w-[200px]">
							{t("workspace.deleteDiskTooltip")}
						</TooltipContent>
					</Tooltip>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
