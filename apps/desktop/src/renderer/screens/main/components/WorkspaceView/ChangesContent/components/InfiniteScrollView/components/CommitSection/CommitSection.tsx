import { workspaceTrpc } from "@superset/workspace-client";
import { type RefObject, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { ChangedFile, CommitInfo } from "shared/changes-types";
import { VirtualizedFileList } from "../../../VirtualizedFileList";

interface CommitSectionProps {
	commit: CommitInfo;
	workspaceId: string;
	worktreePath: string;
	collapsedFiles: Set<string>;
	onToggleFile: (key: string) => void;
	scrollElementRef: RefObject<HTMLDivElement | null>;
}

export function CommitSection({
	commit,
	workspaceId,
	worktreePath,
	collapsedFiles,
	onToggleFile,
	scrollElementRef,
}: CommitSectionProps) {
	const [isCommitExpanded, setIsCommitExpanded] = useState(false);

	const { data: commitFiles } = workspaceTrpc.git.getCommitFiles.useQuery(
		{
			workspaceId,
			commitHash: commit.hash,
		},
		{ enabled: isCommitExpanded },
	);

	const files: ChangedFile[] =
		commitFiles?.files.map((file) => ({
			...file,
			status: file.status === "changed" ? "modified" : file.status,
		})) ?? [];

	return (
		<div className="border-b border-line">
			<button
				type="button"
				onClick={() => setIsCommitExpanded(!isCommitExpanded)}
				className="flex items-center gap-2 px-4 py-2 w-full text-left hover:bg-hover transition-colors"
			>
				{isCommitExpanded ? (
					<LuChevronDown className="size-4 text-fg-mute" />
				) : (
					<LuChevronRight className="size-4 text-fg-mute" />
				)}
				<span className="text-xs font-mono text-fg-mute">
					{commit.shortHash}
				</span>
				<span className="text-sm truncate flex-1">{commit.message}</span>
				<span className="text-xs text-fg-mute">
					{commit.files.length} files
				</span>
			</button>
			{isCommitExpanded && files.length > 0 && (
				<div className="pl-4">
					<VirtualizedFileList
						files={files}
						category="committed"
						commitHash={commit.hash}
						worktreePath={worktreePath}
						collapsedFiles={collapsedFiles}
						onToggleFile={onToggleFile}
						scrollElementRef={scrollElementRef}
					/>
				</div>
			)}
		</div>
	);
}
