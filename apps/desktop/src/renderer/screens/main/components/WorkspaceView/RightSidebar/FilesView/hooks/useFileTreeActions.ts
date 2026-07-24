import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	getBaseName,
	getParentPath,
	joinAbsolutePath,
	resolveNewDirectoryTarget,
	resolveNewFileTarget,
} from "../utils/new-item-paths";

interface UseFileTreeActionsProps {
	workspaceId: string | undefined;
	worktreePath: string | undefined;
	onRefresh: (parentPath: string) => void | Promise<void>;
}

export function useFileTreeActions({
	workspaceId,
	worktreePath,
	onRefresh,
}: UseFileTreeActionsProps) {
	const { t } = useTranslation();
	const writeFileMutation = electronTrpc.filesystem.writeFile.useMutation();
	const createDirectoryMutation =
		electronTrpc.filesystem.createDirectory.useMutation();
	const movePathMutation = electronTrpc.filesystem.movePath.useMutation();
	const deletePathMutation = electronTrpc.filesystem.deletePath.useMutation();
	const copyPathMutation = electronTrpc.filesystem.copyPath.useMutation();

	const createFile = useCallback(
		(parentAbsolutePath: string, name: string, content = "") => {
			if (!workspaceId) {
				return;
			}

			const fileTarget = resolveNewFileTarget(parentAbsolutePath, name);
			if (!fileTarget) {
				toast.error(t("files.toast.failedCreateFileNested"));
				return;
			}

			void (
				fileTarget.targetParentPath !== parentAbsolutePath
					? createDirectoryMutation.mutateAsync({
							workspaceId,
							absolutePath: fileTarget.targetParentPath,
							recursive: true,
						})
					: Promise.resolve()
			)
				.then(() =>
					writeFileMutation.mutateAsync({
						workspaceId,
						absolutePath: fileTarget.absolutePath,
						content,
						encoding: "utf-8",
						options: { create: true, overwrite: false },
					}),
				)
				.then((result) => {
					if (!result.ok) {
						if (result.reason === "exists") {
							toast.error(t("files.toast.failedCreateFileExists", { name }));
							return;
						}
						toast.error(
							t("files.toast.failedCreateFileReason", {
								reason: result.reason,
							}),
						);
						return;
					}

					toast.success(t("files.toast.created", { name }));
					void onRefresh(parentAbsolutePath);
				})
				.catch((error: Error) => {
					toast.error(
						t("files.toast.failedCreateFileError", { message: error.message }),
					);
				});
		},
		[createDirectoryMutation, onRefresh, t, workspaceId, writeFileMutation],
	);

	const createDirectory = useCallback(
		(parentAbsolutePath: string, name: string) => {
			if (!workspaceId) {
				return;
			}

			const directoryTarget = resolveNewDirectoryTarget(
				parentAbsolutePath,
				name,
			);
			if (!directoryTarget) {
				toast.error(t("files.toast.failedCreateFolderNested"));
				return;
			}
			void createDirectoryMutation
				.mutateAsync({
					workspaceId,
					absolutePath: directoryTarget.absolutePath,
					recursive: true,
				})
				.then(() => {
					toast.success(t("files.toast.created", { name }));
					void onRefresh(parentAbsolutePath);
				})
				.catch((error: Error) => {
					toast.error(
						t("files.toast.failedCreateFolderError", {
							message: error.message,
						}),
					);
				});
		},
		[createDirectoryMutation, onRefresh, t, workspaceId],
	);

	const rename = useCallback(
		(absolutePath: string, newName: string) => {
			if (!workspaceId) {
				return;
			}

			const destinationAbsolutePath = joinAbsolutePath(
				getParentPath(absolutePath),
				newName,
			);
			void movePathMutation
				.mutateAsync({
					workspaceId,
					sourceAbsolutePath: absolutePath,
					destinationAbsolutePath,
				})
				.then(() => {
					toast.success(t("files.toast.renamedTo", { name: newName }));
					void onRefresh(getParentPath(absolutePath) || worktreePath || "");
				})
				.catch((error: Error) => {
					toast.error(
						t("files.toast.failedRenameError", { message: error.message }),
					);
				});
		},
		[movePathMutation, onRefresh, t, workspaceId, worktreePath],
	);

	const deleteItems = useCallback(
		(absolutePaths: string[], permanent = false) => {
			if (!workspaceId || absolutePaths.length === 0) {
				return;
			}

			void Promise.allSettled(
				absolutePaths.map((absolutePath) =>
					deletePathMutation.mutateAsync({
						workspaceId,
						absolutePath,
						permanent,
					}),
				),
			).then((results) => {
				const deletedCount = results.filter(
					(result) => result.status === "fulfilled",
				).length;
				const errorCount = results.length - deletedCount;

				if (deletedCount > 0) {
					toast.success(
						deletedCount === 1
							? permanent
								? t("files.toast.deleted")
								: t("files.toast.movedToTrash")
							: permanent
								? t("files.toast.deletedItems", { count: deletedCount })
								: t("files.toast.movedItemsToTrash", { count: deletedCount }),
					);
				}

				if (errorCount > 0) {
					toast.error(
						t("files.toast.failedDeleteItems", { count: errorCount }),
					);
				}

				const parentPath = getParentPath(absolutePaths[0]);
				void onRefresh(parentPath || worktreePath || "");
			});
		},
		[deletePathMutation, onRefresh, t, workspaceId, worktreePath],
	);

	const moveItems = useCallback(
		(sourceAbsolutePaths: string[], destinationAbsolutePath: string) => {
			if (!workspaceId || sourceAbsolutePaths.length === 0) {
				return;
			}

			void Promise.allSettled(
				sourceAbsolutePaths.map((sourceAbsolutePath) =>
					movePathMutation.mutateAsync({
						workspaceId,
						sourceAbsolutePath,
						destinationAbsolutePath: joinAbsolutePath(
							destinationAbsolutePath,
							getBaseName(sourceAbsolutePath),
						),
					}),
				),
			).then((results) => {
				const movedCount = results.filter(
					(result) => result.status === "fulfilled",
				).length;
				const errorCount = results.length - movedCount;

				if (movedCount > 0) {
					toast.success(
						movedCount === 1
							? t("files.toast.movedItem")
							: t("files.toast.movedItems", { count: movedCount }),
					);
				}

				if (errorCount > 0) {
					toast.error(t("files.toast.failedMoveItems", { count: errorCount }));
				}

				void onRefresh(destinationAbsolutePath);
			});
		},
		[movePathMutation, onRefresh, t, workspaceId],
	);

	const copyItems = useCallback(
		(sourceAbsolutePaths: string[], destinationAbsolutePath: string) => {
			if (!workspaceId || sourceAbsolutePaths.length === 0) {
				return;
			}

			void Promise.allSettled(
				sourceAbsolutePaths.map((sourceAbsolutePath) =>
					copyPathMutation.mutateAsync({
						workspaceId,
						sourceAbsolutePath,
						destinationAbsolutePath: joinAbsolutePath(
							destinationAbsolutePath,
							getBaseName(sourceAbsolutePath),
						),
					}),
				),
			).then((results) => {
				const copiedCount = results.filter(
					(result) => result.status === "fulfilled",
				).length;
				const errorCount = results.length - copiedCount;

				if (copiedCount > 0) {
					toast.success(
						copiedCount === 1
							? t("files.toast.copiedItem")
							: t("files.toast.copiedItems", { count: copiedCount }),
					);
				}

				if (errorCount > 0) {
					toast.error(t("files.toast.failedCopyItems", { count: errorCount }));
				}

				void onRefresh(destinationAbsolutePath);
			});
		},
		[copyPathMutation, onRefresh, t, workspaceId],
	);

	return {
		createFile,
		createDirectory,
		rename,
		deleteItems,
		moveItems,
		copyItems,
		isCreatingFile: writeFileMutation.isPending,
		isCreatingDirectory: createDirectoryMutation.isPending,
		isRenaming: movePathMutation.isPending,
		isDeleting: deletePathMutation.isPending,
		isMoving: movePathMutation.isPending,
		isCopying: copyPathMutation.isPending,
	};
}
