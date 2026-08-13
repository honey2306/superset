import type { TerminalPreset } from "@superset/shared/desktop-types";
import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { useEffect, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniCommandLine } from "react-icons/hi2";
import { resolvePresetIcon } from "renderer/assets/app-icons/preset-icons";

const PANES_PRESET_BAR_ITEM_TYPE = "V1_PANES_PRESET_BAR_ITEM";

interface PanesPresetBarItemProps {
	preset: TerminalPreset;
	pinnedIndex: number;
	isDark: boolean;
	canOpenInCurrentPane: boolean;
	onOpen: (preset: TerminalPreset) => void;
	onOpenInNewTab: (preset: TerminalPreset) => void;
	onOpenInCurrentPane: (preset: TerminalPreset) => void;
	onEdit: (preset: TerminalPreset) => void;
	onDragStart: () => void;
	onDragEnd: (didDrop: boolean) => void;
	onLocalReorder: (fromIndex: number, toIndex: number) => void;
	onPersistReorder: (
		presetId: string,
		originalPinnedIndex: number,
		targetPinnedIndex: number,
	) => boolean;
}

interface PanesPresetDragItem {
	id: string;
	index: number;
	originalIndex: number;
	persisted: boolean;
}

export function PanesPresetBarItem({
	preset,
	pinnedIndex,
	isDark,
	canOpenInCurrentPane,
	onOpen,
	onOpenInNewTab,
	onOpenInCurrentPane,
	onEdit,
	onDragStart,
	onDragEnd,
	onLocalReorder,
	onPersistReorder,
}: PanesPresetBarItemProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const icon = resolvePresetIcon(preset.name, preset.icon, isDark);
	const [{ isDragging, sourceHandlerId }, drag] = useDrag(
		() => ({
			type: PANES_PRESET_BAR_ITEM_TYPE,
			item: () => {
				onDragStart();
				return {
					id: preset.id,
					index: pinnedIndex,
					originalIndex: pinnedIndex,
					persisted: false,
				} satisfies PanesPresetDragItem;
			},
			end: (item, monitor) => onDragEnd(monitor.didDrop() && item.persisted),
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
				sourceHandlerId: monitor.getHandlerId(),
			}),
		}),
		[preset.id, pinnedIndex, onDragStart, onDragEnd],
	);
	const [{ targetHandlerId }, drop] = useDrop(
		() => ({
			accept: PANES_PRESET_BAR_ITEM_TYPE,
			hover: (item: PanesPresetDragItem) => {
				if (item.index === pinnedIndex) {
					return;
				}
				onLocalReorder(item.index, pinnedIndex);
				item.index = pinnedIndex;
			},
			drop: (item: PanesPresetDragItem) => {
				if (item.originalIndex === item.index) {
					return;
				}
				item.persisted = onPersistReorder(
					item.id,
					item.originalIndex,
					item.index,
				);
			},
			collect: (monitor) => ({ targetHandlerId: monitor.getHandlerId() }),
		}),
		[pinnedIndex, onLocalReorder, onPersistReorder],
	);

	useEffect(() => {
		drag(drop(containerRef));
	}, [drag, drop]);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					ref={containerRef}
					data-dnd-source-id={sourceHandlerId ?? undefined}
					data-dnd-target-id={targetHandlerId ?? undefined}
					className={isDragging ? "opacity-40" : undefined}
					style={{ cursor: isDragging ? "grabbing" : "grab" }}
				>
					<Button
						variant="ghost"
						size="sm"
						className="h-6 shrink-0 gap-1.5 px-2 text-xs"
						onClick={() => onOpen(preset)}
					>
						{icon ? (
							<img src={icon} alt="" className="size-3.5 object-contain" />
						) : (
							<HiMiniCommandLine className="size-3.5" />
						)}
						<span className="max-w-[120px] truncate">
							{preset.name || "default"}
						</span>
					</Button>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={() => onOpenInNewTab(preset)}>
					Open in new tab
				</ContextMenuItem>
				<ContextMenuItem
					disabled={!canOpenInCurrentPane}
					onSelect={() => onOpenInCurrentPane(preset)}
				>
					Open in current pane
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={() => onEdit(preset)}>
					Edit preset
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
