import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiMiniMinus, HiMiniPlus } from "react-icons/hi2";
import {
	LuCheck,
	LuChevronDown,
	LuChevronRight,
	LuCopy,
	LuExternalLink,
	LuPencil,
	LuUndo2,
} from "react-icons/lu";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ChangedFile } from "shared/changes-types";

interface FileDiffHeaderProps {
	file: ChangedFile;
	fileKey: string;
	isExpanded: boolean;
	onToggleExpanded: () => void;
	isViewed: boolean;
	onViewedChange: (checked: boolean) => void;
	statusBadgeColor: string;
	statusIndicator: React.ReactNode;
	showStats: boolean;
	onOpenInEditor: (e: React.MouseEvent) => void;
	onCopyPath: (e: React.MouseEvent) => void;
	isCopied: boolean;
	isEditing?: boolean;
	onToggleEdit?: () => void;
	onStage?: () => void;
	onUnstage?: () => void;
	onDiscard?: () => void;
	isActioning: boolean;
}

export function FileDiffHeader({
	file,
	fileKey,
	isExpanded,
	onToggleExpanded,
	isViewed,
	onViewedChange,
	statusBadgeColor,
	statusIndicator,
	showStats,
	onOpenInEditor,
	onCopyPath,
	isCopied,
	isEditing,
	onToggleEdit,
	onStage,
	onUnstage,
	onDiscard,
	isActioning,
}: FileDiffHeaderProps) {
	const { t } = useTranslation();
	const hasAction = onStage || onUnstage;
	const isDeleteAction = file.status === "untracked" || file.status === "added";

	return (
		<div
			className={cn(
				"group flex items-center gap-2 px-3 py-1.5 w-full text-left sticky top-0 z-10 bg-hover",
			)}
		>
			<button
				type="button"
				onClick={onToggleExpanded}
				className="shrink-0 p-0.5 -ml-1 rounded hover:bg-accent-tint transition-colors"
			>
				{isExpanded ? (
					<LuChevronDown className="size-4 text-fg-mute" />
				) : (
					<LuChevronRight className="size-4 text-fg-mute" />
				)}
			</button>

			<span className={cn("shrink-0 flex items-center", statusBadgeColor)}>
				{statusIndicator}
			</span>

			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						className="group/filename flex items-center gap-1 text-xs truncate min-w-0 hover:underline hover:text-accent-solid cursor-pointer font-mono"
						onClick={onOpenInEditor}
						aria-label={t("v1Changes.fileDiffHeader.openInEditor", {
							path: file.path,
						})}
					>
						<span className="truncate">{file.path}</span>
						<LuExternalLink className="size-3 shrink-0 opacity-0 group-hover/filename:opacity-100 transition-opacity" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{t("v1Changes.fileDiffHeader.clickToOpenInEditor")}
				</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onCopyPath}
						className="shrink-0 rounded p-1 text-fg-faint transition-colors hover:text-fg-mute hover:bg-accent-tint"
					>
						{isCopied ? (
							<LuCheck className="size-3.5 text-success" />
						) : (
							<LuCopy className="size-3.5" />
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{isCopied
						? t("v1Changes.fileDiffHeader.copied")
						: t("v1Changes.fileDiffHeader.copyPath")}
				</TooltipContent>
			</Tooltip>

			{onToggleEdit && (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onToggleEdit();
							}}
							className={cn(
								"shrink-0 rounded p-1 transition-colors",
								isEditing
									? "text-accent-solid bg-accent-tint"
									: "text-fg-faint hover:text-fg-mute hover:bg-accent-tint",
							)}
						>
							<LuPencil className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{isEditing
							? t("v1Changes.fileDiffHeader.switchToReadOnly")
							: t("v1Changes.fileDiffHeader.editFile")}
					</TooltipContent>
				</Tooltip>
			)}

			<div className="flex-1" />

			{showStats && (
				<span className="flex items-center gap-1 text-xs font-mono shrink-0">
					{file.additions > 0 && (
						<span className="text-success dark:text-success">
							+{file.additions}
						</span>
					)}
					{file.deletions > 0 && (
						<span className="text-destructive dark:text-destructive">
							-{file.deletions}
						</span>
					)}
				</span>
			)}

			{/* biome-ignore lint/a11y/useKeyWithClickEvents: checkbox handles keyboard events */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper for checkbox */}
			<div
				className="flex items-center gap-1.5 shrink-0 text-xs cursor-pointer select-none"
				onClick={(e) => e.stopPropagation()}
			>
				<Checkbox
					id={`viewed-${fileKey}`}
					checked={isViewed}
					onCheckedChange={(checked) => onViewedChange(checked === true)}
					className="size-3.5 border-muted-foreground/50"
				/>
				<label
					htmlFor={`viewed-${fileKey}`}
					className="text-fg-mute cursor-pointer"
				>
					{t("v1Changes.fileDiffHeader.viewed")}
				</label>
			</div>

			{/* biome-ignore lint/a11y/useKeyWithClickEvents: nested interactive elements handle their own events */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: this span just stops click propagation */}
			<span
				className="flex items-center gap-1 shrink-0"
				onClick={(e) => e.stopPropagation()}
			>
				{onDiscard && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
								onClick={onDiscard}
								disabled={isActioning}
							>
								<LuUndo2 className="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom" showArrow={false}>
							{isDeleteAction
								? t("v1Changes.fileDiffHeader.delete")
								: t("v1Changes.fileDiffHeader.discardChanges")}
						</TooltipContent>
					</Tooltip>
				)}

				{hasAction && (
					<>
						{onStage && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
										onClick={onStage}
										disabled={isActioning}
									>
										<HiMiniPlus className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom" showArrow={false}>
									{t("v1Changes.fileDiffHeader.stage")}
								</TooltipContent>
							</Tooltip>
						)}
						{onUnstage && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
										onClick={onUnstage}
										disabled={isActioning}
									>
										<HiMiniMinus className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom" showArrow={false}>
									{t("v1Changes.fileDiffHeader.unstage")}
								</TooltipContent>
							</Tooltip>
						)}
					</>
				)}
			</span>
		</div>
	);
}
