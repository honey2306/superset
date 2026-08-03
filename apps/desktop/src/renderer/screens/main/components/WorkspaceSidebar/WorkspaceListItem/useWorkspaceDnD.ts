import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { useDrag, useDrop } from "react-dnd";
import {
	useMoveWorkspacesToSection,
	useMoveWorkspaceToSection,
} from "renderer/react-query/workspaces";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useActiveDragItemStore } from "renderer/stores/active-drag-item";
import { useWorkspaceSelectionStore } from "renderer/stores/workspace-selection";
import { SECTION_DND_TYPE } from "../constants";
import type { DragItem, SectionDragItem } from "../types";
import { WORKSPACE_DND_TYPE } from "./constants";

interface UseWorkspaceDnDOptions {
	id: string;
	projectId: string;
	sectionId: string | null;
	index: number;
}

export function useWorkspaceDnD({
	id,
	projectId,
	sectionId,
	index,
}: UseWorkspaceDnDOptions) {
	const { reorderProjectChildrenByIndex, reorderWorkspacesInSectionByIndex } =
		useDashboardSidebarState();
	const moveToSection = useMoveWorkspaceToSection();
	const bulkMoveToSection = useMoveWorkspacesToSection();
	const selectionStore = useWorkspaceSelectionStore;

	const handleReorder = useCallback(
		(item: DragItem) => {
			if (item.originalIndex === item.index) return;
			try {
				if (item.sectionId !== null) {
					reorderWorkspacesInSectionByIndex(
						item.sectionId,
						item.originalIndex,
						item.index,
					);
				} else {
					reorderProjectChildrenByIndex(
						item.projectId,
						item.originalIndex,
						item.index,
					);
				}
			} catch (error) {
				toast.error(
					`Failed to reorder workspace: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
		[reorderProjectChildrenByIndex, reorderWorkspacesInSectionByIndex],
	);

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: WORKSPACE_DND_TYPE,
			item: () => {
				const selection = selectionStore.getState();
				const isPartOfSelection = selection.selectedIds.has(id);
				if (!isPartOfSelection) {
					selection.clearSelection();
				}
				const selectedIds =
					isPartOfSelection && selection.selectedIds.size > 1
						? [...selection.selectedIds]
						: undefined;
				const dragItem: DragItem = {
					kind: "workspace",
					id,
					projectId,
					sectionId,
					index,
					originalIndex: index,
					selectedIds,
				};
				useActiveDragItemStore.getState().setActiveDragItem(dragItem);
				return dragItem;
			},
			end: (item, monitor) => {
				useActiveDragItemStore.getState().clearActiveDragItem();
				selectionStore.getState().clearSelection();
				if (!item) return;
				if (item.handled || monitor.didDrop()) return;
				handleReorder(item);
			},
			collect: (monitor) => ({ isDragging: monitor.isDragging() }),
		}),
		[id, projectId, sectionId, index, handleReorder],
	);

	const [, drop] = useDrop({
		accept:
			sectionId === null
				? [WORKSPACE_DND_TYPE, SECTION_DND_TYPE]
				: WORKSPACE_DND_TYPE,
		hover: (item: DragItem | SectionDragItem) => {
			if (item.kind === "section") {
				if (
					sectionId !== null ||
					item.projectId !== projectId ||
					item.index === index
				) {
					return;
				}
				item.index = index;
				return;
			}
			if (item.selectedIds && item.selectedIds.length > 1) return;
			if (
				item.projectId !== projectId ||
				item.sectionId !== sectionId ||
				item.index === index
			)
				return;
			item.index = index;
		},
		drop: (item: DragItem | SectionDragItem) => {
			if (item.kind === "section") {
				if (sectionId !== null || item.projectId !== projectId) return;
				try {
					reorderProjectChildrenByIndex(
						projectId,
						item.originalIndex,
						item.index,
					);
				} catch (error) {
					toast.error(
						`Failed to reorder project items: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
				if (item.originalIndex !== item.index) return { reordered: true };
				return;
			}
			if (item.projectId !== projectId) return;
			if (item.sectionId === sectionId) {
				handleReorder(item);
				if (item.originalIndex !== item.index) return { reordered: true };
			} else if (!item.handled) {
				if (item.selectedIds && item.selectedIds.length > 1) {
					bulkMoveToSection.mutate({
						workspaceIds: item.selectedIds,
						projectId,
						sectionId,
					});
				} else {
					moveToSection.mutate({
						workspaceId: item.id,
						projectId,
						sectionId,
					});
				}
				item.handled = true;
				return { moved: true };
			}
		},
	});

	return { isDragging, drag, drop };
}
