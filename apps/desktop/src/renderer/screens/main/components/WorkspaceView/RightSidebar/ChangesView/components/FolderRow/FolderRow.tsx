import type { ExternalApp } from "@superset/shared/desktop-types";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useState } from "react";
import {
	VscAdd,
	VscChevronRight,
	VscClippy,
	VscDiscard,
	VscFolderOpened,
	VscLinkExternal,
	VscRemove,
} from "react-icons/vsc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import { usePathActions } from "../../hooks";
import { DiscardConfirmDialog } from "../DiscardConfirmDialog";
import type { RowHoverAction } from "../RowHoverActions";
import { RowHoverActions } from "../RowHoverActions";

interface FolderRowProps {
	name: string;
	isExpanded: boolean;
	onToggle: (expanded: boolean) => void;
	children: ReactNode;
	level?: number;
	fileCount?: number;
	variant?: "tree" | "grouped";
	folderPath: string;
	worktreePath: string;
	onStageAll?: () => void;
	onUnstageAll?: () => void;
	onDiscardAll?: () => void;
	isActioning?: boolean;
	projectId?: string;
	defaultApp?: ExternalApp | null;
}

function LevelIndicators({ level }: { level: number }) {
	if (level === 0) return null;

	return (
		<div className="flex self-stretch shrink-0">
			{Array.from({ length: level }).map((_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static visual dividers that never reorder
				<div key={i} className="w-3 self-stretch border-r border-line/50" />
			))}
		</div>
	);
}

function FolderRowHeader({
	name,
	level,
	fileCount,
	isGrouped,
	isExpanded,
}: {
	name: string;
	level: number;
	fileCount?: number;
	isGrouped: boolean;
	isExpanded: boolean;
}) {
	return (
		<>
			{!isGrouped && (
				<VscChevronRight
					className={cn(
						"size-2.5 text-fg-mute shrink-0 transition-transform duration-150",
						isExpanded && "rotate-90",
					)}
				/>
			)}
			{!isGrouped && <LevelIndicators level={level} />}
			<div className="flex items-center gap-1 flex-1 min-w-0">
				<span
					className={cn(
						"truncate",
						isGrouped ? "w-0 grow text-left" : "flex-1 min-w-0 text-xs text-fg",
					)}
					dir={isGrouped ? "rtl" : undefined}
				>
					{name}
				</span>
				{fileCount !== undefined && (
					<span className="text-[10px] text-fg-mute shrink-0 tabular-nums">
						{fileCount}
					</span>
				)}
			</div>
		</>
	);
}

export function FolderRow({
	name,
	isExpanded,
	onToggle,
	children,
	level = 0,
	fileCount,
	variant = "tree",
	folderPath,
	worktreePath,
	onStageAll,
	onUnstageAll,
	onDiscardAll,
	isActioning = false,
	projectId,
	defaultApp,
}: FolderRowProps) {
	const { t } = useTranslation();
	const [showDiscardDialog, setShowDiscardDialog] = useState(false);
	const isGrouped = variant === "grouped";
	const isRoot = folderPath === "";
	const absolutePath = isRoot
		? worktreePath
		: toAbsoluteWorkspacePath(worktreePath, folderPath);
	const hasAction = !!(onStageAll || onUnstageAll || onDiscardAll);
	const discardFileCount = fileCount ?? "all";

	const { copyPath, copyRelativePath, revealInFinder, openInEditor } =
		usePathActions({
			absolutePath,
			relativePath: folderPath || undefined,
			defaultApp,
			projectId,
		});

	const openDiscardDialog = () => setShowDiscardDialog(true);
	const hoverActions: RowHoverAction[] = [
		...(onDiscardAll
			? [
					{
						key: "discard-all",
						label: t("changes.folder.discardAll"),
						icon: <VscDiscard className="size-3" />,
						onClick: openDiscardDialog,
						isDestructive: true,
						disabled: isActioning,
					},
				]
			: []),
		...(onStageAll
			? [
					{
						key: "stage-all",
						label: t("changes.folder.stageAll"),
						icon: <VscAdd className="size-3" />,
						onClick: onStageAll,
						disabled: isActioning,
					},
				]
			: []),
		...(onUnstageAll
			? [
					{
						key: "unstage-all",
						label: t("changes.folder.unstageAll"),
						icon: <VscRemove className="size-3" />,
						onClick: onUnstageAll,
						disabled: isActioning,
					},
				]
			: []),
	];

	const triggerContent = (
		<CollapsibleTrigger
			className={cn(
				"flex-1 min-w-0 flex gap-1.5 text-left overflow-hidden",
				"text-xs items-stretch py-0.5",
				isGrouped && "text-fg-mute",
			)}
		>
			<FolderRowHeader
				name={name}
				level={level}
				fileCount={fileCount}
				isGrouped={isGrouped}
				isExpanded={isExpanded}
			/>
		</CollapsibleTrigger>
	);

	const contextMenuContent = (
		<ContextMenuContent className="w-48">
			<ContextMenuItem onClick={copyPath}>
				<VscClippy className="mr-2 size-4" />
				{t("changes.fileItem.copyPath")}
			</ContextMenuItem>
			{!isRoot && (
				<ContextMenuItem onClick={copyRelativePath}>
					<VscClippy className="mr-2 size-4" />
					{t("changes.fileItem.copyRelativePath")}
				</ContextMenuItem>
			)}
			<ContextMenuSeparator />
			<ContextMenuItem onClick={revealInFinder}>
				<VscFolderOpened className="mr-2 size-4" />
				{t("changes.fileItem.revealInFinder")}
			</ContextMenuItem>
			<ContextMenuItem onClick={openInEditor}>
				<VscLinkExternal className="mr-2 size-4" />
				{t("changes.fileItem.openInEditor")}
			</ContextMenuItem>

			{(onStageAll || onUnstageAll || onDiscardAll) && <ContextMenuSeparator />}

			{onStageAll && (
				<ContextMenuItem onClick={onStageAll} disabled={isActioning}>
					<VscAdd className="mr-2 size-4" />
					{t("changes.folder.stageAll")}
				</ContextMenuItem>
			)}

			{onUnstageAll && (
				<ContextMenuItem onClick={onUnstageAll} disabled={isActioning}>
					<VscRemove className="mr-2 size-4" />
					{t("changes.folder.unstageAll")}
				</ContextMenuItem>
			)}

			{onDiscardAll && (
				<ContextMenuItem
					onClick={openDiscardDialog}
					disabled={isActioning}
					className="text-destructive focus:text-destructive"
				>
					<VscDiscard className="mr-2 size-4" />
					{t("changes.folder.discardAll")}
				</ContextMenuItem>
			)}
		</ContextMenuContent>
	);

	return (
		<>
			<Collapsible
				open={isExpanded}
				onOpenChange={onToggle}
				className={cn("min-w-0", isGrouped && "overflow-hidden")}
			>
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<div
							className={cn(
								"group flex items-center min-w-0 rounded-sm px-1.5",
								"hover:bg-hover cursor-pointer transition-colors",
							)}
						>
							{triggerContent}
							{hasAction && <RowHoverActions actions={hoverActions} />}
						</div>
					</ContextMenuTrigger>
					{contextMenuContent}
				</ContextMenu>
				<CollapsibleContent
					className={cn(
						"min-w-0",
						isGrouped && "ml-1.5 border-l border-line pl-0.5",
					)}
				>
					{children}
				</CollapsibleContent>
			</Collapsible>

			<DiscardConfirmDialog
				open={showDiscardDialog}
				onOpenChange={setShowDiscardDialog}
				title={t("changes.folder.discardAllTitle", { name })}
				description={t("changes.folder.discardAllDesc", {
					count: discardFileCount,
				})}
				onConfirm={() => onDiscardAll?.()}
				confirmDisabled={!onDiscardAll || isActioning}
			/>
		</>
	);
}
