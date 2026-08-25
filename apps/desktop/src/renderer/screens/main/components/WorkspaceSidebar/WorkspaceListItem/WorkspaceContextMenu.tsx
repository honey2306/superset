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
import { useRef, useState } from "react";
import {
	LuArrowRightLeft,
	LuBellOff,
	LuCopy,
	LuExternalLink,
	LuEye,
	LuEyeOff,
	LuFolderOpen,
	LuFolderPlus,
	LuGitBranch,
	LuGitPullRequest,
	LuMinus,
	LuPencil,
	LuX,
} from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	useCreateSectionFromWorkspaces,
	useMoveWorkspacesToSection,
	useMoveWorkspaceToSection,
} from "renderer/react-query/workspaces";
import { useContextMenuDeleteDialogCoordinator } from "renderer/react-query/workspaces/useWorkspaceDeleteHandler";
import { useWorkspaceSelectionStore } from "renderer/stores/workspace-selection";
import { STROKE_WIDTH } from "../constants";
import { getPullRequestMenuActions } from "./pullRequestMenuActions";
import { WorkspaceBranchActions } from "./WorkspaceBranchActions";

interface WorkspaceContextMenuProps {
	id: string;
	projectId: string;
	branch: string;
	hostUrl: string | null;
	hostWorkspaceId: string | null;
	isBranchWorkspace: boolean;
	isUnread: boolean;
	showDeleteHotkey?: boolean;
	workspaceStatus: string | null | undefined;
	sections: { id: string; name: string }[];
	onRename: () => void;
	onRenameBranch: () => void;
	onOpenInFinder: () => void;
	onOpenInEditor: () => void;
	onCopyPath: () => void;
	onCopyBranchName: () => void;
	onSetUnread: (isUnread: boolean) => void;
	onResetStatus: () => void;
	onDelete: () => void;
	pullRequest: { url: string; number: number } | null;
	isPullRequestSuppressed: boolean;
	onOpenPullRequest: () => void;
	onOpenUrl: (url: string) => void;
	onUnlinkPullRequest: () => void;
	onRestorePullRequest: () => void;
	children: React.ReactNode;
}

export function WorkspaceContextMenu({
	id,
	projectId,
	branch,
	hostUrl,
	hostWorkspaceId,
	isBranchWorkspace,
	isUnread,
	showDeleteHotkey = false,
	workspaceStatus,
	sections,
	onRename,
	onRenameBranch,
	onOpenInFinder,
	onOpenInEditor,
	onCopyPath,
	onCopyBranchName,
	onSetUnread,
	onResetStatus,
	onDelete,
	pullRequest,
	isPullRequestSuppressed,
	onOpenPullRequest,
	onOpenUrl,
	onUnlinkPullRequest,
	onRestorePullRequest,
	children,
}: WorkspaceContextMenuProps) {
	const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
	const { t } = useTranslation();
	const contextMenuSelectionRef = useRef<string[]>([]);
	const selectionStore = useWorkspaceSelectionStore;
	const moveToSection = useMoveWorkspaceToSection();
	const bulkMoveToSection = useMoveWorkspacesToSection();
	const createSectionFromWorkspaces = useCreateSectionFromWorkspaces();
	const deleteHotkeyText = useHotkeyDisplay("CLOSE_WORKSPACE").text;
	const showDeleteShortcut =
		showDeleteHotkey && deleteHotkeyText !== "Unassigned";
	const deleteDialogCoordinator =
		useContextMenuDeleteDialogCoordinator(onDelete);
	const pullRequestActions = getPullRequestMenuActions({
		hasLinkedPullRequest: pullRequest !== null,
		isPullRequestSuppressed,
	});

	const handleMenuOpenChange = (open: boolean) => {
		setIsContextMenuOpen(open);
		if (open) {
			const { selectedIds } = selectionStore.getState();
			contextMenuSelectionRef.current =
				selectedIds.has(id) && selectedIds.size > 1 ? [...selectedIds] : [];
		}
	};

	const handleMoveToSection = (targetSectionId: string | null) => {
		const captured = contextMenuSelectionRef.current;
		if (captured.length > 1) {
			bulkMoveToSection.mutate({
				workspaceIds: captured,
				projectId,
				sectionId: targetSectionId,
			});
			selectionStore.getState().clearSelection();
		} else {
			moveToSection.mutate({
				workspaceId: id,
				projectId,
				sectionId: targetSectionId,
			});
		}
	};

	const handleCreateSectionFromSelection = () => {
		const captured = contextMenuSelectionRef.current;
		const workspaceIds = captured.length > 1 ? captured : [id];

		createSectionFromWorkspaces.mutate({
			projectId,
			workspaceIds,
		});

		if (captured.length > 1) {
			selectionStore.getState().clearSelection();
		}
	};

	const unreadMenuItem = (
		<ContextMenuItem onSelect={() => onSetUnread(!isUnread)}>
			{isUnread ? (
				<>
					<LuEye className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
					{t("workspace.markRead")}
				</>
			) : (
				<>
					<LuEyeOff className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
					{t("workspace.markUnread")}
				</>
			)}
		</ContextMenuItem>
	);
	const pullRequestMenuItems = pullRequestActions.length > 0 && (
		<>
			<ContextMenuSeparator />
			{pullRequestActions.includes("open") && pullRequest ? (
				<ContextMenuItem onSelect={onOpenPullRequest}>
					<LuGitPullRequest
						className="size-4 mr-2"
						strokeWidth={STROKE_WIDTH}
					/>
					{t("workspace.openPullRequest", { number: pullRequest.number })}
				</ContextMenuItem>
			) : null}
			{pullRequestActions.includes("unlink") ? (
				<ContextMenuItem onSelect={onUnlinkPullRequest}>
					<LuX className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
					{t("workspace.removeLinkedPr")}
				</ContextMenuItem>
			) : null}
			{pullRequestActions.includes("restore") ? (
				<ContextMenuItem onSelect={onRestorePullRequest}>
					<LuGitPullRequest
						className="size-4 mr-2"
						strokeWidth={STROKE_WIDTH}
					/>
					Restore linked PR
				</ContextMenuItem>
			) : null}
		</>
	);

	const commonContextMenuItems = (
		<>
			<WorkspaceBranchActions
				branch={branch}
				hostUrl={hostUrl}
				hostWorkspaceId={hostWorkspaceId}
				isMenuOpen={isContextMenuOpen}
				openUrl={onOpenUrl}
			/>
			<ContextMenuItem
				disabled={!hostUrl || !hostWorkspaceId}
				onSelect={onRenameBranch}
			>
				<LuPencil className="mr-2 size-4" strokeWidth={STROKE_WIDTH} />
				Rename branch
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onSelect={onOpenInFinder}>
				<LuFolderOpen className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
				{t("workspace.openFinder")}
			</ContextMenuItem>
			<ContextMenuItem onSelect={onOpenInEditor}>
				<LuExternalLink className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
				{t("workspace.openEditor")}
			</ContextMenuItem>
			<ContextMenuItem onSelect={onCopyPath}>
				<LuCopy className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
				{t("workspace.copyPath")}
			</ContextMenuItem>
			<ContextMenuItem onSelect={onCopyBranchName}>
				<LuGitBranch className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
				{t("workspace.copyBranch")}
			</ContextMenuItem>
			{pullRequestMenuItems}
			<ContextMenuSeparator />
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<LuArrowRightLeft
						className="size-4 mr-2"
						strokeWidth={STROKE_WIDTH}
					/>
					{t("workspace.moveSection")}
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="!bg-surface-sunk !text-fg">
					<ContextMenuItem onSelect={handleCreateSectionFromSelection}>
						<LuFolderPlus className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						{t("workspace.newSection")}
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onSelect={() => handleMoveToSection(null)}>
						<LuMinus className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						{t("workspace.ungrouped")}
					</ContextMenuItem>
					{sections.length > 0 && <ContextMenuSeparator />}
					{sections.map((section) => (
						<ContextMenuItem
							key={section.id}
							onSelect={() => handleMoveToSection(section.id)}
						>
							{section.name}
						</ContextMenuItem>
					))}
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuSeparator />
			{unreadMenuItem}
			{workspaceStatus && (
				<ContextMenuItem onSelect={onResetStatus}>
					<LuBellOff className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
					{t("workspace.clearStatus")}
				</ContextMenuItem>
			)}
			{!isBranchWorkspace && (
				<>
					<ContextMenuSeparator />
					<ContextMenuItem
						onSelect={() => {
							deleteDialogCoordinator.requestOpenDeleteDialog();
						}}
					>
						<LuX className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						{t("workspace.closeWorktree")}
						{showDeleteShortcut && (
							<ContextMenuShortcut>{deleteHotkeyText}</ContextMenuShortcut>
						)}
					</ContextMenuItem>
				</>
			)}
		</>
	);
	if (isBranchWorkspace) {
		return (
			<ContextMenu onOpenChange={handleMenuOpenChange}>
				<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				<ContextMenuContent
					className="!bg-surface-sunk !text-fg"
					onCloseAutoFocus={(event) => {
						deleteDialogCoordinator.handleCloseAutoFocus(event);
					}}
				>
					{commonContextMenuItems}
				</ContextMenuContent>
			</ContextMenu>
		);
	}

	return (
		<ContextMenu onOpenChange={handleMenuOpenChange}>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent
				className="!bg-surface-sunk !text-fg"
				onCloseAutoFocus={(event) => {
					deleteDialogCoordinator.handleCloseAutoFocus(event);
				}}
			>
				<ContextMenuItem onSelect={onRename}>
					<LuPencil className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
					{t("workspace.renameAction")}
				</ContextMenuItem>
				<ContextMenuSeparator />
				{commonContextMenuItems}
			</ContextMenuContent>
		</ContextMenu>
	);
}
