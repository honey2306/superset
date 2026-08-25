import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import { useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import {
	LuExpand,
	LuFile,
	LuGitBranch,
	LuGitCompareArrows,
	LuInfo,
	LuShrink,
	LuX,
} from "react-icons/lu";
import { HotkeyLabel } from "renderer/hotkeys";
import { openFileInPanes } from "renderer/lib/panes";
import { useCatalogWorkspace } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import {
	RightSidebarTab,
	SidebarMode,
	useSidebarStore,
} from "renderer/stores/sidebar-state";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { useScrollContext } from "../ChangesContent";
import { ChangesView } from "./ChangesView";
import { LogView } from "./ChangesView/components/LogView";
import { FilesView } from "./FilesView";
import { getSidebarHeaderTabButtonClassName } from "./headerTabStyles";
import { InfoView } from "./InfoView";

function TabButton({
	isActive,
	onClick,
	icon,
	label,
	compact,
}: {
	isActive: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
	compact?: boolean;
}) {
	if (compact) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onClick}
						className={getSidebarHeaderTabButtonClassName({
							isActive,
							compact: true,
						})}
					>
						{icon}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{label}
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<button
			type="button"
			onClick={onClick}
			className={getSidebarHeaderTabButtonClassName({ isActive })}
		>
			{icon}
			{label}
		</button>
	);
}

interface RightSidebarProps {
	supportsChanges: boolean;
}

export function RightSidebar({ supportsChanges }: RightSidebarProps) {
	const { workspaceId } = useParams({ strict: false });
	const { workspace } = useCatalogWorkspace(workspaceId);
	const worktreePath = workspace?.worktreePath;
	const currentMode = useSidebarStore((s) => s.currentMode);
	const rightSidebarTab = useSidebarStore((s) => s.rightSidebarTab);
	const setRightSidebarTab = useSidebarStore((s) => s.setRightSidebarTab);
	const toggleSidebar = useSidebarStore((s) => s.toggleSidebar);
	const setMode = useSidebarStore((s) => s.setMode);
	const sidebarWidth = useSidebarStore((s) => s.sidebarWidth);
	const isExpanded = supportsChanges && currentMode === SidebarMode.Changes;
	// Four labeled tabs plus the window actions do not fit at the default
	// 250px sidebar width. Keep the compact icon treatment until the sidebar has
	// enough room for every tab without pushing the actions off-screen.
	const compactTabs = sidebarWidth < 380;

	const handleExpandToggle = () => {
		setMode(isExpanded ? SidebarMode.Tabs : SidebarMode.Changes);
	};

	const hostUtils = workspaceTrpc.useUtils();
	const { scrollToFile } = useScrollContext();

	const invalidateFileContent = useCallback(
		(absolutePath: string) => {
			if (!workspaceId) return;

			Promise.all([
				hostUtils.filesystem.readFile.invalidate({
					workspaceId,
					absolutePath,
				}),
				hostUtils.git.getDiff.invalidate({ workspaceId }),
			]).catch((error) => {
				console.error(
					"[RightSidebar/invalidateFileContent] Failed to invalidate file content queries:",
					{ absolutePath, error },
				);
			});
		},
		[workspaceId, hostUtils],
	);

	const handleFileOpenPane = useCallback(
		(file: ChangedFile, category: ChangeCategory, commitHash?: string) => {
			if (!workspaceId || !worktreePath) return;
			const absolutePath = toAbsoluteWorkspacePath(worktreePath, file.path);
			openFileInPanes(workspaceId, {
				filePath: absolutePath,
				diffCategory: category,
				fileStatus: file.status,
				commitHash,
				oldPath: file.oldPath
					? toAbsoluteWorkspacePath(worktreePath, file.oldPath)
					: undefined,
			});
			invalidateFileContent(absolutePath);
		},
		[workspaceId, worktreePath, invalidateFileContent],
	);

	const handleFileScrollTo = useCallback(
		(file: ChangedFile, category: ChangeCategory, commitHash?: string) => {
			scrollToFile(file, category, commitHash, worktreePath);
		},
		[scrollToFile, worktreePath],
	);

	const handleFileOpen =
		workspaceId && worktreePath
			? isExpanded
				? handleFileScrollTo
				: handleFileOpenPane
			: undefined;

	return (
		<aside className="h-full flex flex-col overflow-hidden">
			<div className="flex items-center bg-background shrink-0 h-10 border-b">
				<div className="flex items-center h-full">
					{supportsChanges && (
						<TabButton
							isActive={rightSidebarTab === RightSidebarTab.Changes}
							onClick={() => setRightSidebarTab(RightSidebarTab.Changes)}
							icon={<LuGitCompareArrows className="size-3.5" />}
							label="Changes"
							compact={compactTabs}
						/>
					)}
					{supportsChanges && (
						<TabButton
							isActive={rightSidebarTab === RightSidebarTab.History}
							onClick={() => setRightSidebarTab(RightSidebarTab.History)}
							icon={<LuGitBranch className="size-3.5" />}
							label="History"
							compact={compactTabs}
						/>
					)}
					<TabButton
						isActive={rightSidebarTab === RightSidebarTab.Files}
						onClick={() => setRightSidebarTab(RightSidebarTab.Files)}
						icon={<LuFile className="size-3.5" />}
						label="Files"
						compact={compactTabs}
					/>
					<TabButton
						isActive={rightSidebarTab === RightSidebarTab.Info}
						onClick={() => setRightSidebarTab(RightSidebarTab.Info)}
						icon={<LuInfo className="size-3.5" />}
						label="Info"
						compact={compactTabs}
					/>
				</div>
				<div className="flex-1" />
				<div className="flex items-center h-10 pr-2 gap-0.5">
					{supportsChanges && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									onClick={handleExpandToggle}
									className="size-6 p-0"
								>
									{isExpanded ? (
										<LuShrink className="size-3.5" />
									) : (
										<LuExpand className="size-3.5" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								<HotkeyLabel
									label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
									id="OPEN_DIFF_VIEWER"
								/>
							</TooltipContent>
						</Tooltip>
					)}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								onClick={toggleSidebar}
								className="size-6 p-0"
							>
								<LuX className="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom" showArrow={false}>
							<HotkeyLabel label="Close sidebar" id="TOGGLE_SIDEBAR" />
						</TooltipContent>
					</Tooltip>
				</div>
			</div>
			{supportsChanges && (
				<div
					className={
						rightSidebarTab === RightSidebarTab.Changes
							? "flex-1 min-h-0 flex flex-col overflow-hidden"
							: "hidden"
					}
				>
					<ChangesView
						onFileOpen={handleFileOpen}
						isExpandedView={isExpanded}
						isActive={rightSidebarTab === RightSidebarTab.Changes}
					/>
				</div>
			)}
			<div
				className={
					rightSidebarTab === RightSidebarTab.Info
						? "flex-1 min-h-0 flex flex-col overflow-hidden"
						: "hidden"
				}
			>
				<InfoView workspaceId={workspaceId ?? null} />
			</div>
			{supportsChanges && (
				<div
					className={
						rightSidebarTab === RightSidebarTab.History
							? "flex-1 min-h-0 flex flex-col overflow-hidden"
							: "hidden"
					}
				>
					{workspaceId && worktreePath ? (
						<LogView
							workspaceId={workspaceId}
							worktreePath={worktreePath}
							projectId={workspace?.projectId}
							isActive={rightSidebarTab === RightSidebarTab.History}
							onFileOpen={(file, commitHash) =>
								handleFileOpen?.(file, "committed", commitHash)
							}
						/>
					) : null}
				</div>
			)}
			<div
				className={
					rightSidebarTab === RightSidebarTab.Info ||
					(rightSidebarTab === RightSidebarTab.Changes && supportsChanges) ||
					(rightSidebarTab === RightSidebarTab.History && supportsChanges)
						? "hidden"
						: "flex-1 min-h-0 flex flex-col overflow-hidden"
				}
			>
				<FilesView />
			</div>
		</aside>
	);
}
