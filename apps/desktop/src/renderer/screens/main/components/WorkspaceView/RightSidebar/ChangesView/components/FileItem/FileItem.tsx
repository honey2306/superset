import type { ExternalApp } from "@superset/shared/desktop-types";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	VscAdd,
	VscClippy,
	VscDiscard,
	VscFolderOpened,
	VscHistory,
	VscLinkExternal,
	VscRemove,
	VscTrash,
} from "react-icons/vsc";
import { FileIcon } from "renderer/lib/fileIcons";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useChangesStore } from "renderer/stores/changes";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { createFileKey, useScrollContext } from "../../../../ChangesContent";
import { useFileDrag, usePathActions } from "../../hooks";
import { getStatusColor, getStatusLabel } from "../../utils";
import { DiscardConfirmDialog } from "../DiscardConfirmDialog";
import { FileHistoryDialog } from "../FileHistoryDialog";
import type { RowHoverAction } from "../RowHoverActions";
import { RowHoverActions } from "../RowHoverActions";
import { TreeLevelGuides } from "../TreeLevelGuides";

interface FileItemProps {
	file: ChangedFile;
	isSelected: boolean;
	onClick: () => void;
	showStats?: boolean;
	level?: number;
	onStage?: () => void;
	onUnstage?: () => void;
	isActioning?: boolean;
	worktreePath?: string;
	onDiscard?: () => void;
	category?: ChangeCategory;
	commitHash?: string;
	/** Expanded view uses scroll-sync highlighting; collapsed view uses selection highlighting */
	isExpandedView?: boolean;
	projectId?: string;
	defaultApp?: ExternalApp | null;
}

function getFileName(path: string): string {
	return path.split("/").pop() || path;
}

export function FileItem({
	file,
	isSelected,
	onClick,
	showStats = true,
	level = 0,
	onStage,
	onUnstage,
	isActioning = false,
	worktreePath,
	onDiscard,
	category,
	commitHash,
	isExpandedView = false,
	projectId,
	defaultApp,
}: FileItemProps) {
	const { t } = useTranslation();
	const [showDiscardDialog, setShowDiscardDialog] = useState(false);
	const [showHistoryDialog, setShowHistoryDialog] = useState(false);
	const { activeFileKey } = useScrollContext();
	const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const { workspaceId } = useParams({ strict: false });
	const selectFile = useChangesStore((s) => s.selectFile);
	const canShowHistory =
		!!worktreePath && file.status !== "untracked" && file.status !== "added";

	const fileName = getFileName(file.path);
	const statusBadgeColor = getStatusColor(file.status);
	const statusLabel = getStatusLabel(file.status);
	const showStatsDisplay =
		showStats && (file.additions > 0 || file.deletions > 0);
	const hasIndent = level > 0;
	const hasAction = onStage || onUnstage || onDiscard;
	const absolutePath = worktreePath
		? toAbsoluteWorkspacePath(worktreePath, file.path)
		: null;

	const isScrollSyncActive =
		category &&
		activeFileKey === createFileKey(file, category, commitHash, worktreePath);
	const isHighlighted = isExpandedView ? isScrollSyncActive : isSelected;

	const { copyPath, copyRelativePath, revealInFinder, openInEditor } =
		usePathActions({
			absolutePath,
			relativePath: file.path,
			worktreePath,
			defaultApp,
			projectId,
		});

	const fileDragProps = useFileDrag({ absolutePath });

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			if (e.metaKey || e.ctrlKey) {
				openInEditor();
				return;
			}

			if (clickTimeoutRef.current) {
				clearTimeout(clickTimeoutRef.current);
				clickTimeoutRef.current = null;
			}

			clickTimeoutRef.current = setTimeout(() => {
				clickTimeoutRef.current = null;
				onClick();
			}, 300);
		},
		[onClick, openInEditor],
	);

	const handleDoubleClick = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			if (clickTimeoutRef.current) {
				clearTimeout(clickTimeoutRef.current);
				clickTimeoutRef.current = null;
			}

			openInEditor();
		},
		[openInEditor],
	);

	useEffect(() => {
		return () => {
			if (clickTimeoutRef.current) {
				clearTimeout(clickTimeoutRef.current);
			}
		};
	}, []);

	const handleDiscardClick = () => {
		setShowDiscardDialog(true);
	};

	const handleConfirmDiscard = () => {
		setShowDiscardDialog(false);
		onDiscard?.();
	};

	const isDeleteAction = file.status === "untracked" || file.status === "added";
	const discardLabel = isDeleteAction
		? t("changes.fileItem.delete")
		: t("changes.fileItem.discard");
	const discardDialogTitle = isDeleteAction
		? t("changes.fileItem.deleteTitle", { name: fileName })
		: t("changes.fileItem.discardTitle", { name: fileName });
	const discardDialogDescription = isDeleteAction
		? t("changes.fileItem.deleteDesc")
		: t("changes.fileItem.discardDesc");
	const hoverActions: RowHoverAction[] = [
		...(onDiscard
			? [
					{
						key: "discard",
						label: discardLabel,
						icon: isDeleteAction ? (
							<VscTrash className="size-3" />
						) : (
							<VscDiscard className="size-3" />
						),
						onClick: handleDiscardClick,
						isDestructive: true,
						disabled: isActioning,
					},
				]
			: []),
		...(onStage
			? [
					{
						key: "stage",
						label: t("changes.fileItem.stage"),
						icon: <VscAdd className="size-3" />,
						onClick: onStage,
						disabled: isActioning,
					},
				]
			: []),
		...(onUnstage
			? [
					{
						key: "unstage",
						label: t("changes.fileItem.unstage"),
						icon: <VscRemove className="size-3" />,
						onClick: onUnstage,
						disabled: isActioning,
					},
				]
			: []),
	];

	const fileContent = (
		<div
			{...fileDragProps}
			className={cn(
				"group relative w-full flex items-stretch gap-1 px-2 text-left rounded-sm",
				"hover:bg-hover cursor-pointer transition-colors",
				isHighlighted && "bg-accent-tint",
			)}
		>
			{hasIndent && <TreeLevelGuides level={level} />}
			<button
				type="button"
				onClick={handleClick}
				onDoubleClick={handleDoubleClick}
				className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden py-1.5"
			>
				<FileIcon fileName={fileName} className="size-4 shrink-0" />
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="min-w-0 flex-1 truncate text-start text-sm">
							{fileName}
						</span>
					</TooltipTrigger>
					<TooltipContent side="right">{file.path}</TooltipContent>
				</Tooltip>
				<span className="ml-auto flex shrink-0 items-center gap-2.5 whitespace-nowrap font-mono text-xs tabular-nums">
					{showStatsDisplay && (
						<span className="flex items-center gap-1">
							{file.additions > 0 && (
								<span className="text-success">+{file.additions}</span>
							)}
							{file.deletions > 0 && (
								<span className="text-destructive">-{file.deletions}</span>
							)}
						</span>
					)}
					<span
						className={cn("w-4 text-center font-semibold", statusBadgeColor)}
					>
						{statusLabel}
					</span>
				</span>
			</button>

			{hasAction && <RowHoverActions actions={hoverActions} />}
		</div>
	);

	if (!worktreePath) {
		return fileContent;
	}

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger asChild>{fileContent}</ContextMenuTrigger>
				<ContextMenuContent className="w-52">
					<ContextMenuItem onClick={copyPath}>
						<VscClippy className="mr-2 size-4" />
						{t("changes.fileItem.copyPath")}
					</ContextMenuItem>
					<ContextMenuItem onClick={copyRelativePath}>
						<VscClippy className="mr-2 size-4" />
						{t("changes.fileItem.copyRelativePath")}
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onClick={revealInFinder}>
						<VscFolderOpened className="mr-2 size-4" />
						{t("changes.fileItem.revealInFinder")}
					</ContextMenuItem>
					<ContextMenuItem onClick={openInEditor}>
						<VscLinkExternal className="mr-2 size-4" />
						{t("changes.fileItem.openInEditor")}
					</ContextMenuItem>
					{canShowHistory && (
						<>
							<ContextMenuSeparator />
							<ContextMenuItem onClick={() => setShowHistoryDialog(true)}>
								<VscHistory className="mr-2 size-4" />
								{t("changes.fileHistory.showHistory")}
							</ContextMenuItem>
						</>
					)}

					{(onStage || onUnstage || onDiscard) && <ContextMenuSeparator />}

					{onStage && (
						<ContextMenuItem onClick={onStage} disabled={isActioning}>
							<VscAdd className="mr-2 size-4" />
							{t("changes.fileItem.stage")}
						</ContextMenuItem>
					)}

					{onUnstage && (
						<ContextMenuItem onClick={onUnstage} disabled={isActioning}>
							<VscRemove className="mr-2 size-4" />
							{t("changes.fileItem.unstage")}
						</ContextMenuItem>
					)}

					{onDiscard && (
						<ContextMenuItem
							onClick={handleDiscardClick}
							disabled={isActioning}
							className="text-destructive focus:text-destructive"
						>
							{isDeleteAction ? (
								<VscTrash className="mr-2 size-4" />
							) : (
								<VscDiscard className="mr-2 size-4" />
							)}
							{discardLabel}
						</ContextMenuItem>
					)}
				</ContextMenuContent>
			</ContextMenu>

			<DiscardConfirmDialog
				open={showDiscardDialog}
				onOpenChange={setShowDiscardDialog}
				title={discardDialogTitle}
				description={discardDialogDescription}
				onConfirm={handleConfirmDiscard}
				confirmLabel={
					isDeleteAction
						? t("changes.fileItem.delete")
						: t("changes.fileItem.discard")
				}
				confirmDisabled={!onDiscard || isActioning}
			/>

			{canShowHistory && worktreePath && (
				<FileHistoryDialog
					open={showHistoryDialog}
					onOpenChange={setShowHistoryDialog}
					worktreePath={worktreePath}
					filePath={file.path}
					selectedCommitHash={commitHash ?? null}
					onSelectCommit={(hash) => {
						if (!workspaceId || !absolutePath) return;
						selectFile(workspaceId, absolutePath, file, "committed", hash);
					}}
				/>
			)}
		</>
	);
}
