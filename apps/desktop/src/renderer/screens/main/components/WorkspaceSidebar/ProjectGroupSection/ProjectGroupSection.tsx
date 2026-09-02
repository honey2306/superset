import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiChevronRight, HiEllipsisHorizontal } from "react-icons/hi2";
import { LuPencil, LuTrash2 } from "react-icons/lu";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useDashboardSidebarState } from "renderer/routes/_local/hooks/useDashboardSidebarState";
import {
	PROJECT_DND_TYPE,
	PROJECT_GROUP_DND_TYPE,
	STROKE_WIDTH,
} from "../constants";
import { RenameInput } from "../RenameInput";
import type { ProjectDragItem, ProjectGroupDragItem } from "../types";

interface ProjectGroupSectionProps {
	projectGroupId: string | null;
	name: string;
	projectCount: number;
	isCollapsed: boolean;
	index: number;
	orderedProjectGroupIds: string[];
	onToggleCollapsed: () => void;
	children: React.ReactNode;
}

export function ProjectGroupSection({
	projectGroupId,
	name,
	projectCount,
	isCollapsed,
	index,
	orderedProjectGroupIds,
	onToggleCollapsed,
	children,
}: ProjectGroupSectionProps) {
	const { t } = useTranslation();
	const {
		deleteProjectGroup,
		moveProjectToGroup,
		renameProjectGroup,
		reorderProjectGroups,
	} = useDashboardSidebarState();
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(name);

	const commitGroupReorder = useCallback(
		(item: ProjectGroupDragItem) => {
			if (projectGroupId === null) return false;
			const fromIndex = orderedProjectGroupIds.indexOf(item.projectGroupId);
			if (
				fromIndex === -1 ||
				item.index < 0 ||
				item.index >= orderedProjectGroupIds.length ||
				fromIndex === item.index
			) {
				return false;
			}
			const nextIds = [...orderedProjectGroupIds];
			const [movedId] = nextIds.splice(fromIndex, 1);
			if (!movedId) return false;
			nextIds.splice(item.index, 0, movedId);
			reorderProjectGroups(nextIds);
			return true;
		},
		[orderedProjectGroupIds, projectGroupId, reorderProjectGroups],
	);

	const [{ isDragging, sourceHandlerId }, drag] = useDrag(
		() => ({
			type: PROJECT_GROUP_DND_TYPE,
			canDrag: projectGroupId !== null,
			item: {
				kind: "project-group" as const,
				projectGroupId: projectGroupId ?? "",
				index,
				originalIndex: index,
			},
			end: (item: ProjectGroupDragItem | undefined, monitor) => {
				if (!item || monitor.didDrop()) return;
				commitGroupReorder(item);
			},
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
				sourceHandlerId: monitor.getHandlerId(),
			}),
		}),
		[projectGroupId, index, commitGroupReorder],
	);

	const [{ isProjectOver, targetHandlerId }, drop] = useDrop(
		() => ({
			accept: [PROJECT_DND_TYPE, PROJECT_GROUP_DND_TYPE],
			hover: (item: ProjectDragItem | ProjectGroupDragItem) => {
				if (item.kind === "project-group" && item.index !== index) {
					item.index = index;
				}
			},
			drop: (item: ProjectDragItem | ProjectGroupDragItem) => {
				if (item.kind === "project") {
					if (item.projectGroupId === projectGroupId) return;
					moveProjectToGroup(item.projectId, projectGroupId);
					return { movedProject: true };
				}
				if (commitGroupReorder(item)) return { reorderedGroup: true };
			},
			collect: (monitor) => ({
				isProjectOver:
					monitor.isOver({ shallow: true }) &&
					monitor.getItemType() === PROJECT_DND_TYPE,
				targetHandlerId: monitor.getHandlerId(),
			}),
		}),
		[index, projectGroupId, moveProjectToGroup, commitGroupReorder],
	);

	const headerRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		drop(headerRef);
		if (projectGroupId !== null) drag(headerRef);
	}, [drag, drop, projectGroupId]);

	const handleSubmitRename = () => {
		const trimmedName = renameValue.trim();
		if (projectGroupId && trimmedName && trimmedName !== name) {
			try {
				renameProjectGroup(projectGroupId, trimmedName);
			} catch (error) {
				toast.error(
					`Failed to rename project group: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
		setIsRenaming(false);
	};

	const handleDelete = () => {
		if (!projectGroupId) return;
		try {
			deleteProjectGroup(projectGroupId);
		} catch (error) {
			toast.error(
				`Failed to delete project group: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	return (
		<div
			className={cn(
				"border-b border-line last:border-b-0",
				isDragging && "opacity-30",
			)}
		>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div
						ref={headerRef}
						data-dnd-source-id={sourceHandlerId ?? undefined}
						data-dnd-target-id={targetHandlerId ?? undefined}
						className={cn(
							"flex items-center w-full pl-2 pr-2 py-2 text-[11px] font-medium uppercase tracking-wider",
							"text-fg-mute hover:bg-hover/50 transition-colors",
							projectGroupId !== null && "cursor-grab",
							isDragging && "cursor-grabbing",
							isProjectOver &&
								"bg-accent-tint ring-1 ring-inset ring-accent-line",
						)}
					>
						{isRenaming ? (
							<RenameInput
								value={renameValue}
								onChange={setRenameValue}
								onSubmit={handleSubmitRename}
								onCancel={() => {
									setRenameValue(name);
									setIsRenaming(false);
								}}
								className="h-5 px-1 py-0 text-[11px] tracking-wider font-medium bg-transparent border-none outline-none flex-1 min-w-0 text-fg-mute"
							/>
						) : (
							<button
								type="button"
								onClick={onToggleCollapsed}
								onDoubleClick={() => {
									if (projectGroupId) {
										setRenameValue(name);
										setIsRenaming(true);
									}
								}}
								className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer"
							>
								<HiChevronRight
									className={cn(
										"size-3 shrink-0 transition-transform duration-150",
										!isCollapsed && "rotate-90",
									)}
								/>
								<span className="truncate">{name}</span>
								<span className="text-[10px] tabular-nums font-normal">
									({projectCount})
								</span>
							</button>
						)}
						{projectGroupId && !isRenaming && (
							<button
								type="button"
								aria-label={t("workspace.projectGroupMenu")}
								className="flex size-5 items-center justify-center rounded-ds-2 text-fg-faint transition-colors hover:bg-hover hover:text-fg"
								onClick={(event) => {
									event.stopPropagation();
									const rect = event.currentTarget.getBoundingClientRect();
									event.currentTarget.dispatchEvent(
										new MouseEvent("contextmenu", {
											bubbles: true,
											clientX: rect.left + rect.width / 2,
											clientY: rect.top + rect.height / 2,
										}),
									);
								}}
							>
								<HiEllipsisHorizontal className="size-4" />
							</button>
						)}
					</div>
				</ContextMenuTrigger>
				{projectGroupId && (
					<ContextMenuContent>
						<ContextMenuItem
							onSelect={() => {
								setRenameValue(name);
								setIsRenaming(true);
							}}
						>
							<LuPencil className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							{t("workspace.renameProjectGroup")}
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem
							onSelect={handleDelete}
							className="text-destructive focus:text-destructive"
						>
							<LuTrash2
								className="size-4 mr-2 text-destructive"
								strokeWidth={STROKE_WIDTH}
							/>
							{t("workspace.deleteProjectGroup")}
						</ContextMenuItem>
					</ContextMenuContent>
				)}
			</ContextMenu>

			<AnimatePresence initial={false}>
				{!isCollapsed && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="overflow-hidden pl-1"
					>
						{children}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
