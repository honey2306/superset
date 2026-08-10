import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import type { WorkspaceOperation } from "@superset/workspace-client";
import { useState } from "react";
import { HiExclamationTriangle } from "react-icons/hi2";
import { LuLoader } from "react-icons/lu";
import { useDestroyWorkspace } from "renderer/hooks/host-service/useDestroyWorkspace/useDestroyWorkspace";
import { useTranslation } from "renderer/providers/I18nProvider";
import { deleteWithToast } from "renderer/routes/_authenticated/components/TeardownLogsDialog";

interface WorkspaceProvisioningOperationViewProps {
	workspaceId: string;
	workspaceName: string;
	operation: WorkspaceOperation;
	onRetry: () => void;
	isRetrying?: boolean;
}

/**
 * Provisioning owns initialization state now. This component renders only a
 * host operation projection and never reads the legacy Electron init bridge.
 */
export function WorkspaceProvisioningOperationView({
	workspaceId,
	workspaceName,
	operation,
	onRetry,
	isRetrying = false,
}: WorkspaceProvisioningOperationViewProps) {
	const { t } = useTranslation();
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const deleteWorkspace = useDestroyWorkspace(workspaceId);
	const hasFailed = operation.state === "failed";

	const handleDelete = async () => {
		setShowDeleteConfirm(false);
		setIsDeleting(true);
		try {
			await deleteWithToast({
				name: workspaceName,
				deleteFn: () => deleteWorkspace.destroy(),
				forceDeleteFn: () => deleteWorkspace.destroy({ force: true }),
			});
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<>
			<div className="flex h-full w-full flex-col items-center justify-center px-8">
				<div className="flex max-w-md flex-col items-center space-y-5 text-center">
					{hasFailed ? (
						<div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
							<HiExclamationTriangle className="size-8 text-destructive" />
						</div>
					) : (
						<LuLoader className="size-12 animate-spin text-fg-mute" />
					)}

					<div className="space-y-2">
						<h2 className="text-lg font-medium text-fg">
							{hasFailed
								? t("workspace.setupFailed")
								: t("workspace.settingUpWorkspace")}
						</h2>
						<p className="text-sm text-fg-mute">{workspaceName}</p>
						{operation.failure?.message && (
							<p className="mt-2 rounded-ds-3 bg-destructive/5 px-3 py-2 text-xs text-destructive/80 select-text [overflow-wrap:anywhere]">
								{operation.failure.message}
							</p>
						)}
						{operation.stage && !hasFailed && (
							<p className="text-xs text-fg-mute/70">
								{operation.stage}
							</p>
						)}
					</div>

					<div className="flex gap-3">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setShowDeleteConfirm(true)}
							disabled={isDeleting || isRetrying}
						>
							{isDeleting
								? t("workspace.deleting")
								: t("workspace.deleteAction")}
						</Button>
						{hasFailed && operation.failure?.retryable && (
							<Button size="sm" onClick={onRetry} disabled={isRetrying}>
								{isRetrying ? (
									<>
										<LuLoader className="mr-2 size-4 animate-spin" />
										{t("workspace.retrying")}
									</>
								) : (
									t("workspace.retry")
								)}
							</Button>
						)}
					</div>
				</div>
			</div>

			<AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
				<AlertDialogContent className="max-w-[340px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							{t("workspace.deleteNamedQuestion", { name: workspaceName })}
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-fg-mute">
								{t("workspace.deleteFailedDescription")}
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pb-4 pt-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => setShowDeleteConfirm(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button
							variant="destructive"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={handleDelete}
						>
							{t("common.delete")}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
