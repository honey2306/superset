import type { ItemInstance } from "@headless-tree/core";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { cn } from "@superset/ui/utils";
import {
	LuChevronDown,
	LuChevronRight,
	LuClipboard,
	LuCopy,
	LuExternalLink,
	LuFile,
	LuFolder,
	LuFolderOpen,
	LuPencil,
	LuTrash2,
} from "react-icons/lu";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { DirectoryEntry } from "shared/file-tree-types";
import { useFileDrag, usePathActions } from "../../../ChangesView/hooks";
import { FileIcon } from "../../utils";

interface FileTreeItemProps {
	item: ItemInstance<DirectoryEntry>;
	entry: DirectoryEntry;
	rowHeight: number;
	indent: number;
	worktreePath: string;
	projectId?: string;
	onActivate: (entry: DirectoryEntry, openInNewTab?: boolean) => void;
	onOpenInEditor: (entry: DirectoryEntry) => void;
	onNewFile: (parentPath: string) => void;
	onNewFolder: (parentPath: string) => void;
	onRename: (entry: DirectoryEntry) => void;
	onDelete: (entry: DirectoryEntry) => void;
}

export function FileTreeItem({
	item,
	entry,
	rowHeight,
	indent,
	worktreePath,
	projectId,
	onActivate,
	onOpenInEditor,
	onNewFile,
	onNewFolder,
	onRename,
	onDelete,
}: FileTreeItemProps) {
	const { t } = useTranslation();
	const isFolder = entry.isDirectory;
	const isExpanded = item.isExpanded();
	const level = item.getItemMeta().level;

	const parentPath = isFolder
		? entry.path
		: entry.path.split("/").slice(0, -1).join("/") || worktreePath;

	const { copyPath, copyRelativePath, revealInFinder, openInEditor } =
		usePathActions({
			absolutePath: entry.path,
			relativePath: entry.relativePath,
			worktreePath,
			projectId,
		});

	const fileDragProps = useFileDrag({ absolutePath: entry.path });

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (e.metaKey || e.ctrlKey) {
			onOpenInEditor(entry);
		} else if (isFolder) {
			if (isExpanded) {
				item.collapse();
			} else {
				item.expand();
			}
		} else if (e.shiftKey) {
			onActivate(entry, true);
		} else {
			onActivate(entry);
		}
	};

	const handleDoubleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onOpenInEditor(entry);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (isFolder) {
				if (isExpanded) {
					item.collapse();
				} else {
					item.expand();
				}
			} else {
				onActivate(entry, e.metaKey || e.ctrlKey ? true : undefined);
			}
		}
	};

	const itemContent = (
		<div
			{...item.getProps()}
			{...fileDragProps}
			data-item-id={item.getId()}
			style={{
				height: rowHeight,
				paddingLeft: level * indent,
			}}
			role="treeitem"
			tabIndex={0}
			aria-expanded={isFolder ? isExpanded : undefined}
			className={cn(
				"flex items-center gap-1 px-1 cursor-pointer select-none",
				"hover:bg-accent/50 transition-colors",
				item.isSelected() && "bg-accent",
			)}
			onClick={handleClick}
			onDoubleClick={handleDoubleClick}
			onKeyDown={handleKeyDown}
		>
			<span className="flex items-center justify-center w-4 h-4 shrink-0">
				{isFolder ? (
					isExpanded ? (
						<LuChevronDown className="size-3.5 text-muted-foreground" />
					) : (
						<LuChevronRight className="size-3.5 text-muted-foreground" />
					)
				) : null}
			</span>

			<FileIcon
				fileName={entry.name}
				isDirectory={isFolder}
				isOpen={isExpanded}
				className="size-4 shrink-0"
			/>

			<span className="flex-1 min-w-0 text-xs truncate">{entry.name}</span>
		</div>
	);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{itemContent}</ContextMenuTrigger>
			<ContextMenuContent className="w-48">
				<ContextMenuItem onClick={() => onNewFile(parentPath)}>
					<LuFile className="mr-2 size-4" />
					{t("files.newFile")}
				</ContextMenuItem>
				<ContextMenuItem onClick={() => onNewFolder(parentPath)}>
					<LuFolder className="mr-2 size-4" />
					{t("files.newFolder")}
				</ContextMenuItem>

				<ContextMenuSeparator />

				<ContextMenuItem onClick={copyPath}>
					<LuClipboard className="mr-2 size-4" />
					{t("files.copyPath")}
				</ContextMenuItem>
				<ContextMenuItem onClick={copyRelativePath}>
					<LuCopy className="mr-2 size-4" />
					{t("files.copyRelativePath")}
				</ContextMenuItem>

				<ContextMenuSeparator />

				<ContextMenuItem onClick={revealInFinder}>
					<LuFolderOpen className="mr-2 size-4" />
					{t("files.revealInFinder")}
				</ContextMenuItem>
				<ContextMenuItem onClick={openInEditor}>
					<LuExternalLink className="mr-2 size-4" />
					{t("files.openInEditor")}
				</ContextMenuItem>

				<ContextMenuSeparator />

				<ContextMenuItem onClick={() => onRename(entry)}>
					<LuPencil className="mr-2 size-4" />
					{t("files.rename")}
				</ContextMenuItem>
				<ContextMenuItem
					onClick={() => onDelete(entry)}
					className="text-destructive focus:text-destructive"
				>
					<LuTrash2 className="mr-2 size-4" />
					{t("files.delete")}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
