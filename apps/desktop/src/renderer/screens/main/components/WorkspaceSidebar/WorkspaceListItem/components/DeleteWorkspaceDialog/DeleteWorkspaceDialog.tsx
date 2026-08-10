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
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDestroyWorkspace } from "renderer/hooks/host-service/useDestroyWorkspace/useDestroyWorkspace";
import {
	disposeHostSessionsForWorkspace,
	toastDisposeFailures,
} from "renderer/lib/dispose-host-sessions";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { deleteWithToast } from "renderer/routes/_authenticated/components/TeardownLogsDialog";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useCatalogWorkspace } from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider/selectors";
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
	const electronUtils = electronTrpc.useUtils();
	const { hideWorkspaceInSidebar } = useDashboardSidebarState();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const { activeHostUrl } = useLocalHostService();
	const { workspace: catalogWorkspace } = useCatalogWorkspace(workspaceId);
	const workspaceProjectId =
		catalogWorkspace?.projectId ??
		hostWorkspaces.find((workspace) => workspace.id === workspaceId)?.projectId;
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

	const handleClose = useCallback(() => {
		onOpenChange(false);

		if (workspaceProjectId) {
			hideWorkspaceInSidebar(workspaceId, workspaceProjectId);
			if (params.workspaceId === workspaceId) {
				void navigate({ to: "/workspace" });
			}

			const retryDispose = () =>
				disposeHostSessionsForWorkspace(electronUtils, workspaceId);
			void retryDispose().then((result) =>
				toastDisposeFailures(result, retryDispose),
			);
			toast.success(t("workspace.hidden"));
			return;
		}
		toast.error(t("workspace.hideFailed"));
	}, [
		electronUtils,
		hideWorkspaceInSidebar,
		navigate,
		onOpenChange,
		params.workspaceId,
		t,
		workspaceId,
		workspaceProjectId,
	]);

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

	// Handle Enter key press to trigger delete/close action
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

				if (isBranch) {
					// For branch workspaces, Enter triggers close
					handleClose();
				} else {
					// For regular workspaces, Enter triggers delete if enabled
					if (canDelete && !isLoading) {
						handleDelete();
					}
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		open,
		isBranch,
		canDelete,
		isLoading, // For branch workspaces, Enter triggers close
		handleClose,
		handleDelete,
	]);

	// For branch workspaces, use simplified dialog (only close option)
	if (isBranch) {
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
							{t("workspace.closeNamedQuestion", { name: workspaceName })}
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-fg-mute space-y-1.5">
								<span className="block">
									{t("workspace.closeBranchDescription")}
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
							{t("common.cancel")}
						</Button>
						<Button
							ref={closeActionButtonRef}
							variant="secondary"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={handleClose}
						>
							{t("workspace.close")}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	}

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
						<div className="text-xs text-warning dark:text-warning bg-warning-tint dark:bg-warning-tint border border-yellow-200 dark:border-yellow-500/20 rounded-ds-3 px-2.5 py-1.5">
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
					<Button
						ref={closeActionButtonRef}
						variant="secondary"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={handleClose}
					>
						{t("workspace.hide")}
					</Button>
					<Tooltip delayDuration={400}>
						<TooltipTrigger asChild>
							<Button
								variant="destructive"
								size="sm"
								className="h-7 px-3 text-xs"
								onClick={handleDelete}
								disabled={!canDelete || isLoading}
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
