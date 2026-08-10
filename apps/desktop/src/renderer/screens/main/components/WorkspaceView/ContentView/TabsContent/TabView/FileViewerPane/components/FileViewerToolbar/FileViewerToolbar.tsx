import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";

import {
	TbFold,
	TbLayoutSidebarRightFilled,
	TbListDetails,
	TbPinFilled,
} from "react-icons/tb";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import type { DiffViewMode } from "shared/changes-types";
import type { FileViewerMode } from "shared/tabs-types";
import { PaneToolbarActions } from "../../../components";
import type { SplitOrientation } from "../../../hooks";

interface FileViewerToolbarProps {
	fileName: string;
	filePath: string;
	isDirty: boolean;
	viewMode: FileViewerMode;
	/** If false, this is a preview pane (italic name, can be replaced) */
	isPinned: boolean;
	/** Show Rendered tab (for markdown/images) */
	hasRenderedMode: boolean;
	/** Show Changes tab (when file has diff) */
	hasDiff: boolean;
	splitOrientation: SplitOrientation;
	diffViewMode: DiffViewMode;
	hideUnchangedRegions: boolean;
	onViewModeChange: (value: string) => void;
	onDiffViewModeChange: (mode: DiffViewMode) => void;
	onToggleHideUnchangedRegions: () => void;
	onSplitPane: (e: React.MouseEvent) => void;
	/** Pin this pane (convert from preview to permanent) */
	onPin: () => void;
	onClosePane: (e: React.MouseEvent) => void;
}

export function FileViewerToolbar({
	fileName,
	filePath,
	isDirty,
	viewMode,
	isPinned,
	hasRenderedMode,
	hasDiff,
	splitOrientation,
	diffViewMode,
	hideUnchangedRegions,
	onViewModeChange,
	onDiffViewModeChange,
	onToggleHideUnchangedRegions,
	onSplitPane,
	onPin,
	onClosePane,
}: FileViewerToolbarProps) {
	const { copyToClipboard, copied } = useCopyToClipboard(1500);

	const handleCopyPath = () => {
		copyToClipboard(filePath);
	};
	return (
		<div className="flex h-full w-full items-center justify-between px-3">
			<div className="flex min-w-0 items-center gap-2">
				<Tooltip open={copied ? true : undefined}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleCopyPath}
							className={cn(
								"truncate text-xs text-fg-mute hover:text-fg transition-colors text-left",
								!isPinned && "italic",
							)}
						>
							{isDirty && <span className="text-warning mr-1">●</span>}
							{fileName}
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{copied ? "Copied!" : "Click to copy path"}
					</TooltipContent>
				</Tooltip>
			</div>
			<div className="flex items-center gap-1">
				{(hasRenderedMode || hasDiff) && (
					<ToggleGroup
						type="single"
						value={viewMode}
						onValueChange={onViewModeChange}
						size="sm"
						className="h-5 bg-hover/50 rounded-ds-3"
					>
						{hasRenderedMode && (
							<ToggleGroupItem
								value="rendered"
								className="h-5 px-1.5 text-[10px] text-fg-mute data-[state=on]:bg-background data-[state=on]:text-fg data-[state=on]:shadow-sm"
							>
								Rendered
							</ToggleGroupItem>
						)}
						<ToggleGroupItem
							value="raw"
							className="h-5 px-1.5 text-[10px] text-fg-mute data-[state=on]:bg-background data-[state=on]:text-fg data-[state=on]:shadow-sm"
						>
							Raw
						</ToggleGroupItem>
						{hasDiff && (
							<ToggleGroupItem
								value="diff"
								className="h-5 px-1.5 text-[10px] text-fg-mute data-[state=on]:bg-background data-[state=on]:text-fg data-[state=on]:shadow-sm"
							>
								Changes
							</ToggleGroupItem>
						)}
					</ToggleGroup>
				)}
				{viewMode === "diff" && (
					<>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() =>
										onDiffViewModeChange(
											diffViewMode === "side-by-side"
												? "inline"
												: "side-by-side",
										)
									}
									className="rounded p-0.5 text-fg-mute/60 transition-colors hover:text-fg-mute"
								>
									{diffViewMode === "side-by-side" ? (
										<TbLayoutSidebarRightFilled className="size-3.5" />
									) : (
										<TbListDetails className="size-3.5" />
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								{diffViewMode === "side-by-side"
									? "Switch to inline diff"
									: "Switch to side by side diff"}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={onToggleHideUnchangedRegions}
									className={cn(
										"rounded p-0.5 transition-colors hover:text-fg-mute",
										hideUnchangedRegions
											? "text-fg"
											: "text-fg-mute/60",
									)}
								>
									<TbFold className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								{hideUnchangedRegions
									? "Show all lines"
									: "Hide unchanged regions"}
							</TooltipContent>
						</Tooltip>
					</>
				)}
				<PaneToolbarActions
					splitOrientation={splitOrientation}
					onSplitPane={onSplitPane}
					onClosePane={onClosePane}
					leadingActions={
						!isPinned ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={onPin}
										className="rounded p-0.5 text-fg-mute/60 transition-colors hover:text-fg-mute"
									>
										<TbPinFilled className="size-3" />
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom" showArrow={false}>
									Pin (keep open)
								</TooltipContent>
							</Tooltip>
						) : null
					}
				/>
			</div>
		</div>
	);
}
