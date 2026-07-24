import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { FilePlus, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { PathActions } from "../PathActions";

interface FolderMenuItemsProps {
	absolutePath: string;
	relativePath: string;
	onNewFile: () => void;
	onNewFolder: () => void;
	onRename: () => void;
	onDelete: () => void;
}

export function FolderMenuItems({
	absolutePath,
	relativePath,
	onNewFile,
	onNewFolder,
	onRename,
	onDelete,
}: FolderMenuItemsProps) {
	const { t } = useTranslation();
	return (
		<>
			<DropdownMenuItem onSelect={() => setTimeout(onNewFile, 0)}>
				<FilePlus />
				{t("v2Workspace.folderMenu.newFile")}
			</DropdownMenuItem>
			<DropdownMenuItem onSelect={() => setTimeout(onNewFolder, 0)}>
				<FolderPlus />
				{t("v2Workspace.folderMenu.newFolder")}
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<PathActions absolutePath={absolutePath} relativePath={relativePath} />
			<DropdownMenuSeparator />
			<DropdownMenuItem onSelect={() => setTimeout(onRename, 0)}>
				<Pencil />
				{t("v2Workspace.folderMenu.rename")}
			</DropdownMenuItem>
			<DropdownMenuItem variant="destructive" onSelect={onDelete}>
				<Trash2 />
				{t("v2Workspace.folderMenu.delete")}
			</DropdownMenuItem>
		</>
	);
}
