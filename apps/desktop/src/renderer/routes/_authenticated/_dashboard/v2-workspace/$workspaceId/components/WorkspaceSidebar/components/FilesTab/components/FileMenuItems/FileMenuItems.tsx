import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
} from "@superset/ui/dropdown-menu";
import {
	ExternalLink,
	FileText,
	Pencil,
	SquarePlus,
	Trash2,
} from "lucide-react";
import { modifierLabel, useSidebarFilePolicy } from "renderer/lib/clickPolicy";
import { useTranslation } from "renderer/providers/I18nProvider";
import { PathActions } from "../PathActions";

interface FileMenuItemsProps {
	absolutePath: string;
	relativePath: string;
	onOpen: () => void;
	onOpenInNewTab: () => void;
	onOpenInEditor: () => void;
	onRename: () => void;
	onDelete: () => void;
}

export function FileMenuItems({
	absolutePath,
	relativePath,
	onOpen,
	onOpenInNewTab,
	onOpenInEditor,
	onRename,
	onDelete,
}: FileMenuItemsProps) {
	const { t } = useTranslation();
	const { tierForAction } = useSidebarFilePolicy();
	const newTabTier = tierForAction("newTab");
	const externalTier = tierForAction("external");
	return (
		<>
			<DropdownMenuItem onSelect={onOpen}>
				<FileText />
				{t("v2Workspace.fileMenu.open")}
			</DropdownMenuItem>
			<DropdownMenuItem onSelect={onOpenInNewTab}>
				<SquarePlus />
				{t("v2Workspace.fileMenu.openInNewTab")}
				{newTabTier && (
					<DropdownMenuShortcut>
						{modifierLabel(newTabTier, t)}
					</DropdownMenuShortcut>
				)}
			</DropdownMenuItem>
			<DropdownMenuItem onSelect={onOpenInEditor}>
				<ExternalLink />
				{t("v2Workspace.fileMenu.openInEditor")}
				{externalTier && (
					<DropdownMenuShortcut>
						{modifierLabel(externalTier, t)}
					</DropdownMenuShortcut>
				)}
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<PathActions absolutePath={absolutePath} relativePath={relativePath} />
			<DropdownMenuSeparator />
			<DropdownMenuItem onSelect={() => setTimeout(onRename, 0)}>
				<Pencil />
				{t("v2Workspace.fileMenu.rename")}
			</DropdownMenuItem>
			<DropdownMenuItem variant="destructive" onSelect={onDelete}>
				<Trash2 />
				{t("v2Workspace.fileMenu.delete")}
			</DropdownMenuItem>
		</>
	);
}
