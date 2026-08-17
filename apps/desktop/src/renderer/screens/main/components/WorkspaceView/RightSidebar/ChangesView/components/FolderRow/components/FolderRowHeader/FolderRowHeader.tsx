import { cn } from "@superset/ui/utils";
import { VscChevronRight } from "react-icons/vsc";
import { TreeLevelGuides } from "../../../TreeLevelGuides";

interface FolderRowHeaderProps {
	name: string;
	level: number;
	fileCount?: number;
	isGrouped: boolean;
	isExpanded: boolean;
}

export function FolderRowHeader({
	name,
	level,
	fileCount,
	isGrouped,
	isExpanded,
}: FolderRowHeaderProps) {
	return (
		<>
			{!isGrouped && <TreeLevelGuides level={level} />}
			{!isGrouped && (
				<VscChevronRight
					className={cn(
						"size-2.5 self-center text-fg-mute shrink-0 transition-transform duration-150",
						isExpanded && "rotate-90",
					)}
				/>
			)}
			<div className="flex items-center gap-1 flex-1 min-w-0 py-0.5">
				<span
					className={cn(
						"truncate",
						isGrouped ? "w-0 grow text-left" : "flex-1 min-w-0 text-xs text-fg",
					)}
					dir={isGrouped ? "rtl" : undefined}
				>
					{name}
				</span>
				{fileCount !== undefined && (
					<span className="text-[10px] text-fg-mute shrink-0 tabular-nums">
						{fileCount}
					</span>
				)}
			</div>
		</>
	);
}
