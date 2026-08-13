import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { FileText } from "lucide-react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { buildEditorDocumentKey } from "renderer/stores/editor-state/types";
import { useEditorDocumentsStore } from "renderer/stores/editor-state/useEditorDocumentsStore";
import type { ChangeCategory } from "shared/changes-types";

interface FileViewerPaneTitleProps {
	workspaceId: string;
	filePath: string;
	displayName?: string;
	isPinned: boolean;
	isActive: boolean;
	diffCategory?: ChangeCategory;
	commitHash?: string;
	oldPath?: string;
}

export function FileViewerPaneTitle({
	workspaceId,
	filePath,
	displayName,
	isPinned,
	isActive,
	diffCategory,
	commitHash,
	oldPath,
}: FileViewerPaneTitleProps) {
	const documentKey = buildEditorDocumentKey({
		workspaceId,
		filePath,
		diffCategory,
		commitHash,
		oldPath,
	});
	const isDirty =
		useEditorDocumentsStore((s) => s.documents[documentKey]?.dirty) ?? false;
	const fileName = displayName ?? filePath.split("/").pop();
	const { copyToClipboard, copied } = useCopyToClipboard(1500);

	return (
		<Tooltip open={copied ? true : undefined}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={() => copyToClipboard(filePath)}
					className={cn(
						"flex min-w-0 items-center gap-2 truncate text-xs transition-colors",
						isActive ? "text-fg hover:text-fg" : "text-fg-mute hover:text-fg",
						!isPinned && "italic",
					)}
				>
					<FileText className="size-3.5 shrink-0" />
					{isDirty && <span className="text-warning">●</span>}
					<span className="truncate">{fileName}</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				{copied ? "Copied!" : "Click to copy path"}
			</TooltipContent>
		</Tooltip>
	);
}
