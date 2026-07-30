import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	TbFold,
	TbLayoutSidebarRightFilled,
	TbListDetails,
	TbPinFilled,
} from "react-icons/tb";
import { useChangesStore } from "renderer/stores/changes";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { FileViewerMode } from "shared/tabs-types";

interface FileViewerPaneHeaderExtrasProps {
	paneId: string;
	viewMode: FileViewerMode;
	isPinned: boolean;
	hasRenderedMode: boolean;
	hasDiff: boolean;
	onViewModeChange: (value: string) => void;
}

export function FileViewerPaneHeaderExtras({
	paneId,
	viewMode,
	isPinned,
	hasRenderedMode,
	hasDiff,
	onViewModeChange,
}: FileViewerPaneHeaderExtrasProps) {
	const pinPane = useTabsStore((s) => s.pinPane);
	const {
		viewMode: diffViewMode,
		setViewMode: setDiffViewMode,
		hideUnchangedRegions,
		toggleHideUnchangedRegions,
	} = useChangesStore();

	const handlePin = () => {
		pinPane(paneId);
	};

	return (
		<div className="flex items-center gap-1">
			<ToggleGroup
				type="single"
				value={viewMode}
				onValueChange={onViewModeChange}
				size="sm"
				className="h-5 bg-muted/50 rounded-md"
			>
				{hasRenderedMode && (
					<ToggleGroupItem
						value="rendered"
						className="h-5 px-1.5 text-[10px] text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
					>
						Rendered
					</ToggleGroupItem>
				)}
				<ToggleGroupItem
					value="raw"
					className="h-5 px-1.5 text-[10px] text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
				>
					Raw
				</ToggleGroupItem>
				{hasDiff && (
					<ToggleGroupItem
						value="diff"
						className="h-5 px-1.5 text-[10px] text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
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
								className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
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
									"rounded p-0.5 transition-colors hover:text-muted-foreground",
									hideUnchangedRegions
										? "text-foreground"
										: "text-muted-foreground/60",
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
			{!isPinned && (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handlePin}
							className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
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
