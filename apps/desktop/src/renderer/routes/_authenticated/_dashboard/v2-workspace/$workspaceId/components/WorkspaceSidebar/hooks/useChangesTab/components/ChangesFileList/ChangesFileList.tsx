import { OverflowFadeContainer } from "@superset/ui/overflow-fade-container";
import { memo, useMemo } from "react";
import {
	type MessageKey,
	useTranslation,
} from "renderer/providers/I18nProvider";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import type { ChangesViewMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { ChangesFoldersView } from "./components/ChangesFoldersView";
import { ChangesSection } from "./components/ChangesSection";
import { ChangesTreeView } from "./components/ChangesTreeView";

/** Pulse from the toolbar's expand-all / collapse-all buttons. `epoch` is 0 until the first press. */
export interface FoldSignal {
	epoch: number;
	action: "collapse" | "expand";
}

interface ChangesFileListProps {
	files: ChangesetFile[];
	workspaceId: string;
	isLoading?: boolean;
	viewMode: ChangesViewMode;
	worktreePath?: string;
	selectedFilePath?: string;
	foldSignal: FoldSignal;
	onSelectFile?: (
		path: string,
		openInNewTab?: boolean,
		changeKey?: string,
	) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
}

type GroupKey = ChangesetFile["source"]["kind"];

const GROUP_ORDER: GroupKey[] = [
	"unstaged",
	"staged",
	"against-base",
	"commit",
];

const GROUP_TITLES: Record<GroupKey, MessageKey> = {
	unstaged: "v2Workspace.changes.groupUnstaged",
	staged: "v2Workspace.changes.groupStaged",
	"against-base": "v2Workspace.changes.groupAgainstBase",
	commit: "v2Workspace.changes.groupCommit",
};

export const ChangesFileList = memo(function ChangesFileList({
	files,
	workspaceId,
	isLoading,
	viewMode,
	worktreePath,
	selectedFilePath,
	foldSignal,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
}: ChangesFileListProps) {
	const { t } = useTranslation();
	const grouped = useMemo(() => {
		const groups: Record<GroupKey, ChangesetFile[]> = {
			unstaged: [],
			staged: [],
			"against-base": [],
			commit: [],
		};
		for (const file of files) {
			groups[file.source.kind].push(file);
		}
		return groups;
	}, [files]);

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				{t("v2Workspace.changes.loading")}
			</div>
		);
	}

	if (files.length === 0) {
		return (
			<div className="px-3 py-6 text-center text-sm text-muted-foreground">
				{t("v2Workspace.changes.noChanges")}
			</div>
		);
	}

	return (
		<OverflowFadeContainer
			fadeEdges={["top", "bottom"]}
			className="relative min-h-0 flex-1 space-y-2 overflow-y-auto pt-1"
			data-changes-scroll-container
		>
			{GROUP_ORDER.map((key) => {
				const groupFiles = grouped[key];
				if (groupFiles.length === 0) return null;
				const hasStagingActions = key === "unstaged" || key === "staged";
				return (
					<ChangesSection
						key={key}
						sectionKey={key}
						title={t(GROUP_TITLES[key])}
						count={groupFiles.length}
						stagingActions={
							hasStagingActions
								? { kind: key as "unstaged" | "staged", workspaceId }
								: undefined
						}
					>
						{viewMode === "tree" ? (
							<ChangesTreeView
								files={groupFiles}
								sectionKind={key}
								workspaceId={workspaceId}
								worktreePath={worktreePath}
								selectedFilePath={selectedFilePath}
								foldSignal={foldSignal}
								onSelectFile={onSelectFile}
								onOpenFile={onOpenFile}
								onOpenInEditor={onOpenInEditor}
							/>
						) : (
							<ChangesFoldersView
								files={groupFiles}
								workspaceId={workspaceId}
								worktreePath={worktreePath}
								foldSignal={foldSignal}
								onSelectFile={onSelectFile}
								onOpenFile={onOpenFile}
								onOpenInEditor={onOpenInEditor}
							/>
						)}
					</ChangesSection>
				);
			})}
		</OverflowFadeContainer>
	);
});
