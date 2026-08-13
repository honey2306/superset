import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	LuArrowDown,
	LuArrowUp,
	LuChevronDown,
	LuChevronUp,
} from "react-icons/lu";
import {
	TbFocus2,
	TbFold,
	TbLayoutSidebarRightFilled,
	TbListDetails,
} from "react-icons/tb";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ChangeCategory, DiffViewMode } from "shared/changes-types";
import type { SectionInfo } from "../../hooks/useFocusMode";

interface DiffToolbarProps {
	viewedCount: number;
	totalFiles: number;
	totalAdditions: number;
	totalDeletions: number;
	pushCount: number;
	pullCount: number;
	hasUpstream: boolean;
	diffViewMode: DiffViewMode;
	onDiffViewModeChange: (mode: DiffViewMode) => void;
	hideUnchangedRegions: boolean;
	onToggleHideUnchangedRegions: () => void;
	focusMode: boolean;
	onToggleFocusMode: () => void;
	sections: SectionInfo[];
	currentSection: SectionInfo | null;
	indexWithinSection: number;
	onNavigatePrev: () => void;
	onNavigateNext: () => void;
	onNavigateToSection: (category: ChangeCategory) => void;
	isFirstFile: boolean;
	isLastFile: boolean;
}

export function DiffToolbar({
	viewedCount,
	totalFiles,
	totalAdditions,
	totalDeletions,
	pushCount,
	pullCount,
	hasUpstream,
	diffViewMode,
	onDiffViewModeChange,
	hideUnchangedRegions,
	onToggleHideUnchangedRegions,
	focusMode,
	onToggleFocusMode,
	sections,
	currentSection,
	indexWithinSection,
	onNavigatePrev,
	onNavigateNext,
	onNavigateToSection,
	isFirstFile,
	isLastFile,
}: DiffToolbarProps) {
	const { t } = useTranslation();
	return (
		<div className="flex items-center gap-3 px-3 py-2.5 border-b border-r border-line bg-background sticky top-0 z-30">
			<div className="flex items-center gap-3 text-xs text-fg-mute flex-1">
				<span>
					{viewedCount}/{totalFiles} {t("changes.toolbar.viewed")}
				</span>
				{!focusMode && (
					<span className="flex items-center gap-1 font-mono">
						{totalFiles} {t("changes.toolbar.files")}
						{totalAdditions > 0 && (
							<span className="text-success dark:text-success">
								+{totalAdditions}
							</span>
						)}
						{totalDeletions > 0 && (
							<span className="text-destructive dark:text-destructive">
								-{totalDeletions}
							</span>
						)}
					</span>
				)}
				{hasUpstream && (pushCount > 0 || pullCount > 0) && (
					<span className="flex items-center gap-2">
						{pushCount > 0 && (
							<span className="flex items-center gap-0.5">
								<LuArrowUp className="size-3" />
								{pushCount}
							</span>
						)}
						{pullCount > 0 && (
							<span className="flex items-center gap-0.5">
								<LuArrowDown className="size-3" />
								{pullCount}
							</span>
						)}
					</span>
				)}
			</div>

			{focusMode && currentSection && (
				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={onNavigatePrev}
						disabled={isFirstFile}
						className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-fg-mute transition-colors hover:text-fg hover:bg-accent-tint disabled:opacity-30 disabled:pointer-events-none"
						aria-label={t("changes.toolbar.prevFile")}
					>
						<LuChevronUp className="size-3.5" />
						{t("changes.toolbar.prev")}
					</button>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="flex items-center gap-1.5 rounded px-2 py-0.5 text-xs transition-colors hover:bg-accent-tint"
							>
								<span className="text-fg font-medium">
									{currentSection.label}
								</span>
								<span className="text-fg-mute font-mono tabular-nums">
									{indexWithinSection + 1}/{currentSection.count}
								</span>
								<LuChevronDown className="size-3 text-fg-mute" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="center" className="min-w-[160px]">
							{sections.map((section) => (
								<DropdownMenuItem
									key={section.category}
									onClick={() => onNavigateToSection(section.category)}
									className={cn(
										"flex items-center justify-between gap-4",
										section.category === currentSection.category &&
											"bg-accent-tint",
									)}
								>
									<span>{section.label}</span>
									<span className="text-fg-mute font-mono text-xs tabular-nums">
										{section.count}
									</span>
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>

					<button
						type="button"
						onClick={onNavigateNext}
						disabled={isLastFile}
						className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-fg-mute transition-colors hover:text-fg hover:bg-accent-tint disabled:opacity-30 disabled:pointer-events-none"
						aria-label={t("changes.toolbar.nextFile")}
					>
						{t("changes.toolbar.next")}
						<LuChevronDown className="size-3.5" />
					</button>
				</div>
			)}

			<div className="flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onToggleFocusMode}
							className={cn(
								"rounded p-1 transition-colors hover:bg-accent-tint",
								focusMode ? "text-fg" : "text-fg-faint hover:text-fg-mute",
							)}
							aria-label={
								focusMode
									? t("changes.toolbar.showAllFiles")
									: t("changes.toolbar.focusModeOneFile")
							}
							aria-pressed={focusMode}
						>
							<TbFocus2 className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{focusMode
							? t("changes.toolbar.showAllFiles")
							: t("changes.toolbar.focusMode")}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() =>
								onDiffViewModeChange(
									diffViewMode === "side-by-side" ? "inline" : "side-by-side",
								)
							}
							className="rounded p-1 text-fg-faint transition-colors hover:text-fg-mute hover:bg-accent-tint"
							aria-label={
								diffViewMode === "side-by-side"
									? t("changes.toolbar.switchToInlineDiff")
									: t("changes.toolbar.switchToSideBySideDiff")
							}
						>
							{diffViewMode === "side-by-side" ? (
								<TbLayoutSidebarRightFilled className="size-4" />
							) : (
								<TbListDetails className="size-4" />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{diffViewMode === "side-by-side"
							? t("changes.toolbar.switchToInlineDiff")
							: t("changes.toolbar.switchToSideBySideDiffTooltip")}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onToggleHideUnchangedRegions}
							className={cn(
								"rounded p-1 transition-colors hover:bg-accent-tint",
								hideUnchangedRegions
									? "text-fg"
									: "text-fg-faint hover:text-fg-mute",
							)}
							aria-label={
								hideUnchangedRegions
									? t("changes.toolbar.showAllLines")
									: t("changes.toolbar.hideUnchangedRegions")
							}
							aria-pressed={hideUnchangedRegions}
						>
							<TbFold className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{hideUnchangedRegions
							? t("changes.toolbar.showAllLines")
							: t("changes.toolbar.hideUnchangedRegions")}
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
