import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import type { EditorSaveResult } from "renderer/stores/editor-state/types";
import type { ChangeCategory } from "shared/changes-types";

const MAX_FILE_SIZE = 2 * 1024 * 1024;

interface UseFileSaveParams {
	workspaceId?: string;
	filePath: string;
	diffCategory?: ChangeCategory;
	getCurrentContent: () => string;
	getRevision: () => string | null;
	onDiffCategoryChange?: (category: ChangeCategory) => void;
	onSaveSuccess: (input: {
		savedContent: string;
		currentContent: string;
		revision: string;
	}) => void;
}

export function useFileSave({
	workspaceId,
	filePath,
	diffCategory,
	onDiffCategoryChange,
	getCurrentContent,
	getRevision,
	onSaveSuccess,
}: UseFileSaveParams) {
	const utils = workspaceTrpc.useUtils();

	const writeFileMutation = workspaceTrpc.filesystem.writeFile.useMutation();

	const handleSaveFile = useCallback(
		async (options?: {
			force?: boolean;
		}): Promise<EditorSaveResult | undefined> => {
			if (!filePath || !workspaceId) return;

			const content = getCurrentContent();
			const precondition =
				options?.force || !getRevision()
					? undefined
					: { ifMatch: getRevision() as string };

			const result = await writeFileMutation.mutateAsync({
				workspaceId,
				absolutePath: filePath,
				content,
				encoding: "utf-8",
				precondition,
			});

			if (!result.ok) {
				if (result.reason === "conflict") {
					try {
						const currentFile = await utils.filesystem.readFile.fetch({
							workspaceId,
							absolutePath: filePath,
							encoding: "utf-8",
							maxBytes: MAX_FILE_SIZE,
						});
						return {
							status: "conflict" as const,
							currentContent: (currentFile.content as string) ?? null,
						};
					} catch {
						return { status: "conflict" as const, currentContent: null };
					}
				}
				return undefined;
			}

			const currentContent = getCurrentContent();
			onSaveSuccess({
				savedContent: content,
				currentContent,
				revision: result.revision,
			});

			void utils.filesystem.readFile.invalidate({
				workspaceId,
				absolutePath: filePath,
			});

			if (diffCategory === "staged") {
				onDiffCategoryChange?.("unstaged");
			}

			return { status: "saved" as const };
		},
		[
			diffCategory,
			filePath,
			getCurrentContent,
			getRevision,
			onDiffCategoryChange,
			onSaveSuccess,
			utils,
			workspaceId,
			writeFileMutation,
		],
	);

	return {
		handleSaveFile,
		isSaving: writeFileMutation.isPending,
	};
}
