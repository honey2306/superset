import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import type { ChangedFile } from "shared/changes-types";

interface LegacyFileMutationInput {
	worktreePath: string;
	filePath: string;
}

export function useFileMutations({
	workspaceId,
}: {
	workspaceId: string;
	worktreePath: string;
}) {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const trpcUtils = workspaceTrpc.useUtils();
	const refetch = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: ["git-changes-status", hostUrl, workspaceId],
		});
		void trpcUtils.git.getDiff.invalidate({ workspaceId });
	}, [hostUrl, queryClient, trpcUtils, workspaceId]);

	const stageFile = workspaceTrpc.git.stageFiles.useMutation({
		onSuccess: refetch,
		onError: (error, variables) => {
			const filePath = variables.filePaths[0] ?? "file";
			console.error(
				`[useFileMutations] Failed to stage file ${filePath}:`,
				error,
			);
			toast.error(`Failed to stage ${filePath}: ${error.message}`);
		},
	});

	const unstageFile = workspaceTrpc.git.unstageFiles.useMutation({
		onSuccess: refetch,
		onError: (error, variables) => {
			const filePath = variables.filePaths[0] ?? "file";
			console.error(
				`[useFileMutations] Failed to unstage file ${filePath}:`,
				error,
			);
			toast.error(`Failed to unstage ${filePath}: ${error.message}`);
		},
	});

	const discardChanges = workspaceTrpc.git.discardFiles.useMutation({
		onSuccess: refetch,
		onError: (error, variables) => {
			const filePath = variables.filePaths[0] ?? "file";
			console.error(
				`[useFileMutations] Failed to discard changes for ${filePath}:`,
				error,
			);
			toast.error(`Failed to discard changes: ${error.message}`);
		},
	});

	const deleteUntracked = workspaceTrpc.git.discardFiles.useMutation({
		onSuccess: refetch,
		onError: (error, variables) => {
			const filePath = variables.filePaths[0] ?? "file";
			console.error(`[useFileMutations] Failed to delete ${filePath}:`, error);
			toast.error(`Failed to delete file: ${error.message}`);
		},
	});

	const stageFileMutation = {
		...stageFile,
		mutate: ({ filePath }: LegacyFileMutationInput) =>
			stageFile.mutate({ workspaceId, filePaths: [filePath] }),
	};
	const unstageFileMutation = {
		...unstageFile,
		mutate: ({ filePath }: LegacyFileMutationInput) =>
			unstageFile.mutate({ workspaceId, filePaths: [filePath] }),
	};

	const handleDiscard = useCallback(
		(file: ChangedFile) => {
			const mutation =
				file.status === "untracked" || file.status === "added"
					? deleteUntracked
					: discardChanges;
			mutation.mutate({ workspaceId, filePaths: [file.path] });
		},
		[workspaceId, deleteUntracked, discardChanges],
	);

	const isActioning =
		stageFile.isPending ||
		unstageFile.isPending ||
		discardChanges.isPending ||
		deleteUntracked.isPending;

	return {
		stageFileMutation,
		unstageFileMutation,
		handleDiscard,
		isActioning,
	};
}
