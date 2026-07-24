import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import {
	LuArrowRightLeft,
	LuArrowUp,
	LuBellOff,
	LuCopy,
	LuEye,
	LuEyeOff,
	LuFolderOpen,
	LuFolderPlus,
	LuGitBranch,
	LuPencil,
	LuRadioTower,
	LuTrash2,
	LuX,
} from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useDashboardSidebarHover } from "../../../../providers/DashboardSidebarHoverProvider";
import { useDashboardSidebarWorkspacePorts } from "../../../../providers/DashboardSidebarPortsProvider";
import { useDashboardSidebarPortKill } from "../../../DashboardSidebarPortsList/hooks/useDashboardSidebarPortKill";

interface DashboardSidebarWorkspaceContextMenuProps {
	workspaceId: string;
	projectId: string;
	isInSection?: boolean;
	isLocalWorkspace: boolean;
	isPinned?: boolean;
	isUnread: boolean;
	hasStatus: boolean;
	showDeleteHotkey?: boolean;
	onCreateSection: () => void;
	onMoveToSection: (sectionId: string | null) => void;
	onOpenInFinder: () => void;
	onCopyPath: () => void;
	onCopyBranchName: () => void;
	onRemoveFromSidebar: () => void;
	onRename?: () => void;
	onDelete?: () => void;
	onToggleUnread: () => void;
	onClearStatus: () => void;
	children: React.ReactNode;
}

export function DashboardSidebarWorkspaceContextMenu({
	workspaceId,
	projectId,
	isInSection,
	isLocalWorkspace,
	isPinned = false,
	isUnread,
	hasStatus,
	showDeleteHotkey = false,
	onCreateSection,
	onMoveToSection,
	onOpenInFinder,
	onCopyPath,
	onCopyBranchName,
	onRemoveFromSidebar,
	onRename,
	onDelete,
	onToggleUnread,
	onClearStatus,
	children,
}: DashboardSidebarWorkspaceContextMenuProps) {
	const { t } = useTranslation();
	const collections = useCollections();
	const { setContextMenuOpen } = useDashboardSidebarHover();
	const portGroup = useDashboardSidebarWorkspacePorts(workspaceId);
	const { isPending: isKillingPorts, killPorts } =
		useDashboardSidebarPortKill();
	const ports = portGroup?.ports ?? [];
	const deleteHotkeyText = useHotkeyDisplay("CLOSE_WORKSPACE").text;
	const showDeleteShortcut =
		showDeleteHotkey && deleteHotkeyText !== "Unassigned";
	const { data: sections = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarSections: collections.v2SidebarSections })
				.where(({ sidebarSections }) =>
					eq(sidebarSections.projectId, projectId),
				)
				.orderBy(({ sidebarSections }) => sidebarSections.tabOrder, "asc")
				.select(({ sidebarSections }) => ({
					id: sidebarSections.sectionId,
					name: sidebarSections.name,
					color: sidebarSections.color,
				})),
		[collections, projectId],
	);
	const handleCloseAllPorts = () => {
		if (isKillingPorts) return;
		void killPorts(ports);
	};

	return (
		<ContextMenu onOpenChange={setContextMenuOpen}>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				{onRename && (
					<ContextMenuItem onSelect={onRename}>
						<LuPencil className="size-4 mr-2" />
						{t("workspace.renameAction")}
					</ContextMenuItem>
				)}
				{isLocalWorkspace && (
					<>
						{onRename && <ContextMenuSeparator />}
						<ContextMenuItem onSelect={onOpenInFinder}>
							<LuFolderOpen className="size-4 mr-2" />
							{t("workspace.openFinder")}
						</ContextMenuItem>
						<ContextMenuItem onSelect={onCopyPath}>
							<LuCopy className="size-4 mr-2" />
							{t("workspace.copyPath")}
						</ContextMenuItem>
					</>
				)}
				{!isLocalWorkspace && onRename && <ContextMenuSeparator />}
				<ContextMenuItem onSelect={onCopyBranchName}>
					<LuGitBranch className="size-4 mr-2" />
					{t("workspace.copyBranch")}
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onToggleUnread}>
					{isUnread ? (
						<>
							<LuEye className="size-4 mr-2" />
							{t("workspace.markRead")}
						</>
					) : (
						<>
							<LuEyeOff className="size-4 mr-2" />
							{t("workspace.markUnread")}
						</>
					)}
				</ContextMenuItem>
				{hasStatus && (
					<ContextMenuItem onSelect={onClearStatus}>
						<LuBellOff className="size-4 mr-2" />
						{t("workspace.clearStatus")}
					</ContextMenuItem>
				)}
				{!isPinned && (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={onCreateSection}>
							<LuFolderPlus className="size-4 mr-2" />
							{t("workspace.newGroupFromWorkspace")}
						</ContextMenuItem>
						{(sections.length > 0 || isInSection) && <ContextMenuSeparator />}
						{sections.length > 0 && (
							<ContextMenuSub>
								<ContextMenuSubTrigger>
									<LuArrowRightLeft className="size-4 mr-2" />
									{t("workspace.moveSection")}
								</ContextMenuSubTrigger>
								<ContextMenuSubContent>
									{sections.map((section) => (
										<ContextMenuItem
											key={section.id}
											onSelect={() => onMoveToSection(section.id)}
										>
											{section.color && (
												<span
													className="size-2 shrink-0 rounded-full mr-2"
													style={{ backgroundColor: section.color }}
												/>
											)}
											{section.name}
										</ContextMenuItem>
									))}
								</ContextMenuSubContent>
							</ContextMenuSub>
						)}
						{isInSection && (
							<ContextMenuItem onSelect={() => onMoveToSection(null)}>
								<LuArrowUp className="size-4 mr-2" />
								{t("workspace.ungroup")}
							</ContextMenuItem>
						)}
					</>
				)}
				<ContextMenuSeparator />
				{ports.length > 0 && (
					<ContextMenuItem
						onSelect={handleCloseAllPorts}
						disabled={isKillingPorts}
						variant="destructive"
					>
						<LuRadioTower className="size-4 mr-2" />
						{t("ports.closeAll")}
					</ContextMenuItem>
				)}
				<ContextMenuItem
					onSelect={onRemoveFromSidebar}
					className="text-destructive focus:text-destructive"
				>
					<LuX className="size-4 mr-2 text-destructive" />
					{t("workspace.removeSidebar")}
				</ContextMenuItem>
				{onDelete ? (
					<ContextMenuItem
						onSelect={onDelete}
						className="text-destructive focus:text-destructive"
					>
						<LuTrash2 className="size-4 mr-2 text-destructive" />
						{t("common.delete")}
						{showDeleteShortcut && (
							<ContextMenuShortcut>{deleteHotkeyText}</ContextMenuShortcut>
						)}
					</ContextMenuItem>
				) : null}
			</ContextMenuContent>
		</ContextMenu>
	);
}
