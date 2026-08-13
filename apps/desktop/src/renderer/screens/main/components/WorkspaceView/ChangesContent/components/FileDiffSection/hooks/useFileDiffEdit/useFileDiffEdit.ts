import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useState } from "react";
import type { ChangeCategory } from "shared/changes-types";
import { isDiffEditable } from "shared/changes-types";

const MAX_FILE_SIZE = 2 * 1024 * 1024;

interface UseFileDiffEditParams {
	category: ChangeCategory;
	workspaceId?: string;
	absolutePath: string;
}

export function useFileDiffEdit({
	category,
	workspaceId,
	absolutePath,
}: UseFileDiffEditParams) {
	const [isEditing, setIsEditing] = useState(false);
	const editable = isDiffEditable(category);

	const hostUtils = workspaceTrpc.useUtils();
	const writeFileMutation = workspaceTrpc.filesystem.writeFile.useMutation();

	const handleSave = useCallback(
		async (
			content: string,
			options?: { expectedContent?: string; force?: boolean },
		) => {
			if (!workspaceId || !absolutePath) return;

			// Diff edits don't track revisions, so compare content directly
			if (!options?.force && options?.expectedContent !== undefined) {
				try {
					const current = await hostUtils.filesystem.readFile.fetch({
						workspaceId,
						absolutePath,
						encoding: "utf-8",
						maxBytes: MAX_FILE_SIZE,
					});
					const currentContent = current.content as string;
					if (currentContent !== options.expectedContent) {
						return {
							status: "conflict" as const,
							currentContent,
						};
					}
				} catch {}
			}

			const result = await writeFileMutation.mutateAsync({
				workspaceId,
				absolutePath,
				content,
				encoding: "utf-8",
			});

			if (result.ok) {
				void hostUtils.git.getDiff.invalidate({ workspaceId });
				void hostUtils.filesystem.readFile.invalidate({
					workspaceId,
					absolutePath,
				});
				return { status: "saved" as const };
			}

			return undefined;
		},
		[absolutePath, hostUtils, workspaceId, writeFileMutation],
	);

	const toggleEdit = editable ? () => setIsEditing((prev) => !prev) : undefined;

	return {
		isEditing,
		editable,
		isSaving: writeFileMutation.isPending,
		toggleEdit,
		handleSave,
	};
}
