import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	TbFold,
	TbFolderOpen,
	TbLayoutSidebarRightFilled,
	TbListDetails,
	TbPinFilled,
} from "react-icons/tb";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useChangesStore } from "renderer/stores/changes";
import type { FileViewerMode } from "shared/tabs-types";

interface FileViewerPaneHeaderExtrasProps {
	filePath: string | null;
	viewMode: FileViewerMode;
	isPinned: boolean;
	hasRenderedMode: boolean;
	hasDiff: boolean;
	onViewModeChange: (value: string) => void;
	onPin: () => void;
}

export function FileViewerPaneHeaderExtras({
	filePath,
	viewMode,
	isPinned,
	hasRenderedMode,
	hasDiff,
	onViewModeChange,
	onPin,
}: FileViewerPaneHeaderExtrasProps) {
	const openInFinderMutation = electronTrpc.external.openInFinder.useMutation();
	const {
		viewMode: diffViewMode,
		setViewMode: setDiffViewMode,
		hideUnchangedRegions,
		toggleHideUnchangedRegions,
	} = useChangesStore();

	return (
		<div className="flex items-center gap-1">
			<ToggleGroup
				type="single"
				value={viewMode}
				onValueChange={(value) => {
					// Radix ToggleGroup (type="single") fires "" when the active item is
					// clicked again to deselect. viewMode must always be one of the enum
					// values ("rendered" | "raw" | "diff") or tRPC persistence rejects it.
					if (value) onViewModeChange(value);
				}}
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
			{viewMode === "diff" && (
				<>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={() =>
									setDiffViewMode(
										diffViewMode === "side-by-side" ? "inline" : "side-by-side",
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
								onClick={toggleHideUnchangedRegions}
								className={cn(
									"rounded p-0.5 transition-colors hover:text-fg-mute",
									hideUnchangedRegions ? "text-fg" : "text-fg-mute/60",
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
			{filePath && (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="Reveal in Finder"
							onClick={() => openInFinderMutation.mutate(filePath)}
							className="rounded p-0.5 text-fg-mute/60 transition-colors hover:text-fg-mute"
						>
							<TbFolderOpen className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Reveal in Finder
					</TooltipContent>
				</Tooltip>
			)}
			{!isPinned && (
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
			)}
		</div>
	);
}
