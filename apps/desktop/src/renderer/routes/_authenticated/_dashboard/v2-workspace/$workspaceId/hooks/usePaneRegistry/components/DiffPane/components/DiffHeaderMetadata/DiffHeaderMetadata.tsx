import { Checkbox } from "@superset/ui/checkbox";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useId, useMemo, useState } from "react";
import { LuArrowUpRight, LuCheck, LuCopy, LuUndo2 } from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useSidebarFilePolicy } from "renderer/lib/clickPolicy";
import { useTranslation } from "renderer/providers/I18nProvider";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/DiscardConfirmDialog";
import { StatusIndicator } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/StatusIndicator";
import type { ChangesetFile } from "../../../../../useChangeset";

interface DiffHeaderMetadataProps {
	file: ChangesetFile;
	workspaceId: string;
	onSetCollapsed: (value: boolean) => void;
	viewed: boolean;
	onSetViewed: (path: string, next: boolean) => void;
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
	onOpenInExternalEditor: (path: string) => void;
}

export function DiffHeaderMetadata({
	file,
	workspaceId,
	onSetCollapsed,
	viewed,
	onSetViewed,
	onOpenFile,
	onOpenInExternalEditor,
}: DiffHeaderMetadataProps) {
	const { t } = useTranslation();
	const viewedId = useId();
	const { copyToClipboard, copied } = useCopyToClipboard();
	const policy = useSidebarFilePolicy();

	const handleToggleViewed = useCallback(() => {
		const next = !viewed;
		onSetViewed(file.path, next);
		onSetCollapsed(next);
	}, [viewed, file.path, onSetViewed, onSetCollapsed]);

	const showDeletedFileToast = useCallback(() => {
		toast.error(t("v2Diff.fileNoLongerExists"), {
			description: t("v2Diff.fileNoLongerExistsDesc", { path: file.path }),
		});
	}, [file.path, t]);

	const handleOpenClick = useCallback(
		(event: React.MouseEvent) => {
			if (file.status === "deleted") {
				showDeletedFileToast();
				return;
			}
			const action = policy.getAction(event);
			if (action === "external") onOpenInExternalEditor(file.path);
			else if (action === "newTab") onOpenFile(file.path, true);
			else if (action === "pane") onOpenFile(file.path, false);
		},
		[
			file.status,
			file.path,
			policy,
			onOpenFile,
			onOpenInExternalEditor,
			showDeletedFileToast,
		],
	);

	const utils = workspaceTrpc.useUtils();
	const discardMutation = workspaceTrpc.git.discardChanges.useMutation({
		onSuccess: () => {
			void utils.git.getStatus.invalidate({ workspaceId });
			void utils.git.getDiff.invalidate({ workspaceId });
		},
		onError: (err) => {
			toast.error(t("v2Diff.couldntDiscardChanges"), {
				description: err.message,
			});
		},
	});
	const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
	const canDiscard = file.source.kind === "unstaged";
	const requestDiscard = useMemo(() => {
		if (!canDiscard) return undefined;
		return () => setShowDiscardConfirm(true);
	}, [canDiscard]);
	const confirmDiscard = useCallback(() => {
		setShowDiscardConfirm(false);
		discardMutation.mutate({ workspaceId, filePath: file.path });
	}, [discardMutation, workspaceId, file.path]);
	const isDeleteAction = file.status === "untracked" || file.status === "added";
	const basename = file.path.split("/").pop() ?? file.path;

	return (
		<>
			<div className="flex shrink-0 items-center gap-1.5">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleOpenClick}
							aria-label={t("v2Diff.openInFileViewer")}
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground"
						>
							<LuArrowUpRight className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{policy.hint}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => void copyToClipboard(file.path)}
							aria-label={t("v2Diff.copyPath")}
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground"
						>
							{copied ? (
								<LuCheck className="size-3.5" />
							) : (
								<LuCopy className="size-3.5" />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{copied ? t("v2Diff.copied") : t("v2Diff.copyPath")}
					</TooltipContent>
				</Tooltip>
				<StatusIndicator status={file.status} iconClassName="size-3.5" />
				<div className="flex items-center gap-1">
					<Checkbox
						id={viewedId}
						checked={viewed}
						onCheckedChange={() => handleToggleViewed()}
						className="size-3 border-muted-foreground/50"
					/>
					<label
						htmlFor={viewedId}
						className="hidden cursor-pointer select-none text-xs text-muted-foreground @min-[380px]/diff-header:inline"
					>
						{t("v2Diff.viewed")}
					</label>
				</div>
				{requestDiscard ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={requestDiscard}
								aria-label={t("v2Workspace.changes.discardChanges")}
								data-discard-button
								className="rounded p-1 text-muted-foreground/60 opacity-0 transition-all hover:bg-accent hover:text-destructive"
							>
								<LuUndo2 className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom" showArrow={false}>
							{t("v2Workspace.changes.discardChanges")}
						</TooltipContent>
					</Tooltip>
				) : null}
			</div>
			{canDiscard ? (
				<DiscardConfirmDialog
					open={showDiscardConfirm}
					onOpenChange={setShowDiscardConfirm}
					title={
						isDeleteAction
							? t("v2Workspace.changes.deleteFile", { name: basename })
							: t("v2Workspace.changes.discardFile", { name: basename })
					}
					description={
						isDeleteAction
							? t("v2Workspace.changes.deleteDesc")
							: t("v2Workspace.changes.discardDesc")
					}
					confirmLabel={
						isDeleteAction
							? t("v2Workspace.changes.deleteAction")
							: t("v2Workspace.changes.discardAction")
					}
					onConfirm={confirmDiscard}
				/>
			) : null}
		</>
	);
}
