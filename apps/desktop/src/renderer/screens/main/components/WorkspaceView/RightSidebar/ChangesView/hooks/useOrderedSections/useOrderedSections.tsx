import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";
import { VscAdd, VscDiscard, VscRemove } from "react-icons/vsc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { getOrderedChangeSectionIds } from "renderer/stores/changes/section-order";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { FileList } from "../../components/FileList";
import type { ChangesViewMode } from "../../types";

export interface OrderedSection {
	id: ChangeCategory;
	title: string;
	count: number;
	isExpanded: boolean;
	onToggle: () => void;
	content: ReactNode;
	actions?: ReactNode;
}

interface UseOrderedSectionsInput {
	sectionOrder: ChangeCategory[];
	expandedSections: Record<ChangeCategory, boolean>;
	toggleSection: (section: ChangeCategory) => void;
	fileListViewMode: ChangesViewMode;
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	worktreePath: string;
	projectId?: string;
	isExpandedView?: boolean;
	stagedFiles: ChangedFile[];
	onStagedFileSelect: (file: ChangedFile) => void;
	onUnstageFile: (file: ChangedFile) => void;
	onUnstageFiles: (files: ChangedFile[]) => void;
	onShowDiscardStagedDialog: () => void;
	onUnstageAll: () => void;
	isDiscardAllStagedPending: boolean;
	isUnstageAllPending: boolean;
	isStagedActioning: boolean;
	unstagedFiles: ChangedFile[];
	onUnstagedFileSelect: (file: ChangedFile) => void;
	onStageFile: (file: ChangedFile) => void;
	onStageFiles: (files: ChangedFile[]) => void;
	onDiscardFiles: (files: ChangedFile[]) => void;
	onShowDiscardUnstagedDialog: () => void;
	onStageAll: () => void;
	isDiscardAllUnstagedPending: boolean;
	isStageAllPending: boolean;
	isUnstagedActioning: boolean;
}

export function useOrderedSections({
	sectionOrder,
	expandedSections,
	toggleSection,
	fileListViewMode,
	selectedFile,
	selectedCommitHash,
	worktreePath,
	projectId,
	isExpandedView,
	stagedFiles,
	onStagedFileSelect,
	onUnstageFile,
	onUnstageFiles,
	onShowDiscardStagedDialog,
	onUnstageAll,
	isDiscardAllStagedPending,
	isUnstageAllPending,
	isStagedActioning,
	unstagedFiles,
	onUnstagedFileSelect,
	onStageFile,
	onStageFiles,
	onDiscardFiles,
	onShowDiscardUnstagedDialog,
	onStageAll,
	isDiscardAllUnstagedPending,
	isStageAllPending,
	isUnstagedActioning,
}: UseOrderedSectionsInput) {
	const { t } = useTranslation();
	const sectionDefinitions: Record<"staged" | "unstaged", OrderedSection> = {
		staged: {
			id: "staged",
			title: t("changes.section.staged"),
			count: stagedFiles.length,
			isExpanded: expandedSections.staged,
			onToggle: () => toggleSection("staged"),
			actions: (
				<div className="flex items-center gap-0.5">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
								onClick={onShowDiscardStagedDialog}
								disabled={isDiscardAllStagedPending}
							>
								<VscDiscard className="w-3.5 h-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							{t("changes.section.discardAllStaged")}
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-6 w-6"
								onClick={onUnstageAll}
								disabled={isUnstageAllPending}
							>
								<VscRemove className="w-4 h-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							{t("changes.section.unstageAll")}
						</TooltipContent>
					</Tooltip>
				</div>
			),
			content: expandedSections.staged ? (
				<FileList
					files={stagedFiles}
					viewMode={fileListViewMode}
					selectedFile={selectedFile}
					selectedCommitHash={selectedCommitHash}
					onFileSelect={onStagedFileSelect}
					onUnstage={onUnstageFile}
					onUnstageFiles={onUnstageFiles}
					isActioning={isStagedActioning}
					worktreePath={worktreePath}
					projectId={projectId}
					category="staged"
					isExpandedView={isExpandedView}
				/>
			) : null,
		},
		unstaged: {
			id: "unstaged",
			title: t("changes.section.unstaged"),
			count: unstagedFiles.length,
			isExpanded: expandedSections.unstaged,
			onToggle: () => toggleSection("unstaged"),
			actions: (
				<div className="flex items-center gap-0.5">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
								onClick={onShowDiscardUnstagedDialog}
								disabled={isDiscardAllUnstagedPending}
							>
								<VscDiscard className="w-3.5 h-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							{t("changes.section.discardAllUnstaged")}
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-6 w-6"
								onClick={onStageAll}
								disabled={isStageAllPending}
							>
								<VscAdd className="w-4 h-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							{t("changes.section.stageAll")}
						</TooltipContent>
					</Tooltip>
				</div>
			),
			content: expandedSections.unstaged ? (
				<FileList
					files={unstagedFiles}
					viewMode={fileListViewMode}
					selectedFile={selectedFile}
					selectedCommitHash={selectedCommitHash}
					onFileSelect={onUnstagedFileSelect}
					onStage={onStageFile}
					onStageFiles={onStageFiles}
					isActioning={isUnstagedActioning}
					worktreePath={worktreePath}
					projectId={projectId}
					onDiscardFiles={onDiscardFiles}
					category="unstaged"
					isExpandedView={isExpandedView}
				/>
			) : null,
		},
	};

	return getOrderedChangeSectionIds(sectionOrder)
		.filter(
			(section): section is "staged" | "unstaged" =>
				section === "staged" || section === "unstaged",
		)
		.map((section) => sectionDefinitions[section]);
}
