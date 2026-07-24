import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	LuFolderOpen,
	LuFolderPlus,
	LuPencil,
	LuSettings,
	LuX,
} from "react-icons/lu";
import { useTranslation } from "renderer/providers/I18nProvider";

interface DashboardSidebarProjectContextMenuProps {
	onCreateSection: () => void;
	onOpenInFinder: () => void;
	onOpenSettings: () => void;
	onRemoveFromSidebar: () => void;
	onRename: () => void;
	children: React.ReactNode;
}

export function DashboardSidebarProjectContextMenu({
	onCreateSection,
	onOpenInFinder,
	onOpenSettings,
	onRemoveFromSidebar,
	onRename,
	children,
}: DashboardSidebarProjectContextMenuProps) {
	const { t } = useTranslation();
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				<ContextMenuItem onSelect={onRename}>
					<LuPencil className="size-4 mr-2" />
					{t("workspace.renameAction")}
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onOpenInFinder}>
					<LuFolderOpen className="size-4 mr-2" />
					{t("workspace.openFinder")}
				</ContextMenuItem>
				<ContextMenuItem onSelect={onOpenSettings}>
					<LuSettings className="size-4 mr-2" />
					{t("workspace.projectSettings")}
				</ContextMenuItem>
				<ContextMenuItem onSelect={onCreateSection}>
					<LuFolderPlus className="size-4 mr-2" />
					{t("workspace.newGroup")}
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					onSelect={onRemoveFromSidebar}
					className="text-destructive focus:text-destructive"
				>
					<LuX className="size-4 mr-2 text-destructive" />
					{t("workspace.removeSidebar")}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
