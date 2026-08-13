import { Alert, AlertDescription, AlertTitle } from "@superset/ui/alert";
import { Button } from "@superset/ui/button";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MarkdownEditorAdapter } from "renderer/components/MarkdownRenderer";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { FileSaveConflictDialog } from "renderer/screens/main/components/WorkspaceView/components/FileSaveConflictDialog";
import { useWorkspaceFileEvents } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents";
import { useChangesStore } from "renderer/stores/changes";
import {
	applyLoadedDocumentContent,
	bindFileViewerSession,
	cancelPendingIntent,
	clearDocumentConflict,
	discardDocumentChanges,
	getEditorDocumentBaselineContent,
	getEditorDocumentCurrentContent,
	hasEditorDocumentInitialized,
	markDocumentSaved,
	resumePendingIntent,
	setDocumentConflict,
	setDocumentExternalDiskChange,
	updateDocumentDraft,
} from "renderer/stores/editor-state/editorCoordinator";
import {
	buildEditorDocumentKey,
	type EditorPendingIntent,
} from "renderer/stores/editor-state/types";
import { useEditorDocumentsStore } from "renderer/stores/editor-state/useEditorDocumentsStore";
import { useEditorSessionsStore } from "renderer/stores/editor-state/useEditorSessionsStore";
import {
	pathsMatch,
	retargetAbsolutePath,
	toAbsoluteWorkspacePath,
} from "shared/absolute-paths";
import type { FileViewerMode, FileViewerState } from "shared/tabs-types";
import type { CodeEditorAdapter } from "../../components";
import { FileViewerContent } from "./components/FileViewerContent";
import { useDiffSearch } from "./hooks/useDiffSearch";
import { useFileContent } from "./hooks/useFileContent";
import { useFileSave } from "./hooks/useFileSave";
import { useMarkdownSearch } from "./hooks/useMarkdownSearch";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

interface FileViewerPaneProps {
	paneId: string;
	tabId: string;
	worktreePath: string;
	onRequestClose: () => void;
	controlledFileViewer: FileViewerState;
	controlledIsFocused: boolean;
	onControlledFileViewerChange: (fileViewer: FileViewerState) => void;
}

function getUnsavedDialogCopy(intent: EditorPendingIntent | null) {
	switch (intent?.type) {
		case "close-pane":
			return {
				description:
					"You have unsaved changes in this file. What would you like to do before closing the pane?",
				discardLabel: "Discard & Close Pane",
				saveLabel: "Save & Close Pane",
			};
		case "close-tab":
			return {
				description:
					"You have unsaved changes in this file. What would you like to do before closing the tab?",
				discardLabel: "Discard & Close Tab",
				saveLabel: "Save & Close Tab",
			};
		case "replace-preview":
			return {
				description:
					"You have unsaved changes in this preview pane. What would you like to do before opening a different file here?",
				discardLabel: "Discard & Open File",
				saveLabel: "Save & Open File",
			};
		default:
			return {
				description:
					"You have unsaved changes. What would you like to do before switching views?",
				discardLabel: "Discard & Switch",
				saveLabel: "Save & Switch",
			};
	}
}

export function FileViewerPane({
	paneId,
	tabId,
	worktreePath,
	onRequestClose,
	controlledFileViewer,
	controlledIsFocused,
	onControlledFileViewerChange,
}: FileViewerPaneProps) {
	const { workspaceId } = useParams({ strict: false });
	const normalizedWorkspaceId = workspaceId ?? worktreePath;
	const fileViewer = controlledFileViewer;
	const isFocused = controlledIsFocused;
	const { viewMode: diffViewMode, hideUnchangedRegions } = useChangesStore();

	const editorRef = useRef<CodeEditorAdapter | null>(null);
	const markdownEditorRef = useRef<MarkdownEditorAdapter | null>(null);
	const markdownContainerRef = useRef<HTMLDivElement>(null);
	const diffContainerRef = useRef<HTMLDivElement>(null);
	const pendingRenamePathRef = useRef<string | null>(null);
	const preserveDocumentStateRef = useRef(false);
	const [isResolvingIntent, setIsResolvingIntent] = useState(false);

	const filePath = fileViewer?.filePath ?? "";
	const viewMode = fileViewer?.viewMode ?? "raw";
	const isPinned = fileViewer?.isPinned ?? false;
	const diffCategory = fileViewer?.diffCategory;
	const commitHash = fileViewer?.commitHash;
	const oldPath = fileViewer?.oldPath;
	const initialLine = fileViewer?.initialLine;
	const initialColumn = fileViewer?.initialColumn;

	const documentKey = useMemo(
		() =>
			buildEditorDocumentKey({
				workspaceId: normalizedWorkspaceId,
				filePath,
				diffCategory,
				commitHash,
				oldPath,
			}),
		[normalizedWorkspaceId, filePath, diffCategory, commitHash, oldPath],
	);
	const documentState = useEditorDocumentsStore(
		(state) => state.documents[documentKey],
	);
	const session = useEditorSessionsStore((state) => state.sessions[paneId]);
	const isDirty = documentState?.dirty ?? false;
	const saveConflict = documentState?.conflict ?? null;
	const hasExternalDiskChange = documentState?.hasExternalDiskChange ?? false;
	const unsavedDialogOpen = session?.dialog === "unsaved";
	const conflictDialogOpen =
		session?.dialog === "conflict" && saveConflict !== null;

	const markdownSearch = useMarkdownSearch({
		containerRef: markdownContainerRef,
		isFocused,
		isRenderedMode: viewMode === "rendered",
		filePath,
	});

	const diffSearch = useDiffSearch({
		containerRef: diffContainerRef,
		isFocused,
		isDiffMode: viewMode === "diff",
		filePath,
	});

	const getCurrentContent = useCallback(() => {
		if (hasEditorDocumentInitialized(documentKey)) {
			return getEditorDocumentCurrentContent(documentKey);
		}

		if (viewMode === "rendered") {
			return markdownEditorRef.current?.getValue() ?? "";
		}

		return editorRef.current?.getValue() ?? "";
	}, [documentKey, viewMode]);

	const {
		rawFileData,
		isLoadingRaw,
		imageData,
		isLoadingImage,
		diffData,
		isLoadingDiff,
		rawRevision,
		workingCopyRevision,
	} = useFileContent({
		workspaceId,
		worktreePath,
		filePath,
		viewMode,
		diffCategory,
		commitHash,
		oldPath,
	});

	useEffect(() => {
		if (!fileViewer || !normalizedWorkspaceId) {
			return;
		}

		const preserveDocumentState =
			preserveDocumentStateRef.current ||
			(pendingRenamePathRef.current !== null &&
				pathsMatch(pendingRenamePathRef.current, filePath));

		bindFileViewerSession(
			paneId,
			{
				workspaceId: normalizedWorkspaceId,
				filePath,
				diffCategory,
				commitHash,
				oldPath,
			},
			{
				preserveDocumentState,
			},
		);

		if (preserveDocumentState) {
			preserveDocumentStateRef.current = false;
			pendingRenamePathRef.current = null;
		}
	}, [
		paneId,
		fileViewer,
		normalizedWorkspaceId,
		filePath,
		diffCategory,
		commitHash,
		oldPath,
	]);

	const updateFileViewer = useCallback(
		(update: (current: FileViewerState) => FileViewerState) => {
			onControlledFileViewerChange(update(controlledFileViewer));
		},
		[controlledFileViewer, onControlledFileViewerChange],
	);

	const { handleSaveFile, isSaving } = useFileSave({
		workspaceId,
		filePath,
		diffCategory,
		onDiffCategoryChange: (category) =>
			updateFileViewer((current) => ({ ...current, diffCategory: category })),
		getCurrentContent,
		getRevision: () =>
			useEditorDocumentsStore.getState().documents[documentKey]
				?.baselineRevision ?? null,
		onSaveSuccess: ({ savedContent, currentContent, revision }) => {
			if (diffCategory === "staged") {
				preserveDocumentStateRef.current = true;
			}
			markDocumentSaved(documentKey, {
				savedContent,
				currentContent,
				revision,
			});
		},
	});

	const performFileSave = useCallback(
		async (options?: { force?: boolean }) => {
			try {
				const result = await handleSaveFile(options);
				if (result?.status === "conflict") {
					setDocumentConflict(documentKey, result.currentContent, paneId);
				}
				return result;
			} catch (error) {
				console.error("[FileViewerPane] Save failed:", error);
				return undefined;
			}
		},
		[documentKey, handleSaveFile, paneId],
	);

	useEffect(() => {
		if (viewMode === "diff" || isLoadingRaw || !rawFileData?.ok || isDirty) {
			return;
		}

		applyLoadedDocumentContent(
			documentKey,
			rawFileData.content,
			rawRevision ?? workingCopyRevision ?? null,
		);
	}, [
		documentKey,
		isDirty,
		isLoadingRaw,
		rawFileData,
		rawRevision,
		viewMode,
		workingCopyRevision,
	]);

	const absoluteFilePath = useMemo(
		() => toAbsoluteWorkspacePath(worktreePath, filePath),
		[worktreePath, filePath],
	);
	const baselineContent = getEditorDocumentBaselineContent(documentKey);

	useEffect(() => {
		const nextHasExternalDiskChange =
			isDirty &&
			viewMode !== "diff" &&
			((rawFileData?.ok === true && rawFileData.content !== baselineContent) ||
				(rawFileData?.ok === false && rawFileData.reason === "not-found"));

		setDocumentExternalDiskChange(documentKey, nextHasExternalDiskChange);
	}, [baselineContent, documentKey, isDirty, rawFileData, viewMode]);

	const hostUrl = useWorkspaceHostUrl(workspaceId ?? null);
	const invalidateCurrentFile = useCallback(() => {
		if (!filePath || !workspaceId || !hostUrl) {
			return;
		}

		const hostClient = getHostServiceClientByUrl(hostUrl);
		const refreshes: Promise<unknown>[] = [
			hostClient.filesystem.readFile.query({
				workspaceId,
				absolutePath: absoluteFilePath,
			}),
		];

		Promise.all(refreshes).catch((error) => {
			console.error("[FileViewerPane] Failed to refresh file queries:", {
				absolutePath: absoluteFilePath,
				error,
			});
		});
	}, [absoluteFilePath, filePath, hostUrl, workspaceId]);

	const handleContentChange = useCallback(
		(value: string | undefined) => {
			if (value === undefined) {
				return;
			}

			const dirty = updateDocumentDraft(documentKey, value);
			if (dirty && !isPinned) {
				onControlledFileViewerChange({
					...controlledFileViewer,
					isPinned: true,
				});
				useEditorSessionsStore.getState().patchSession(paneId, {
					autoPinnedBecauseDirty: true,
				});
			}
		},
		[
			controlledFileViewer,
			documentKey,
			isPinned,
			onControlledFileViewerChange,
			paneId,
		],
	);

	useEffect(() => {
		if (!isDirty) {
			clearDocumentConflict(documentKey);
		}
	}, [documentKey, isDirty]);

	useWorkspaceFileEvents(
		workspaceId ?? "",
		(event) => {
			if (event.type === "overflow") {
				invalidateCurrentFile();
				return;
			}

			if (event.type === "rename") {
				if (!event.absolutePath || !event.oldAbsolutePath) {
					return;
				}

				const nextFilePath = retargetAbsolutePath(
					absoluteFilePath,
					event.oldAbsolutePath,
					event.absolutePath,
					Boolean(event.isDirectory),
				);
				if (!nextFilePath) {
					return;
				}

				pendingRenamePathRef.current = nextFilePath;
				return;
			}

			if (
				!event.absolutePath ||
				!pathsMatch(event.absolutePath, absoluteFilePath)
			) {
				return;
			}

			invalidateCurrentFile();
		},
		Boolean(workspaceId && worktreePath && absoluteFilePath),
	);

	const switchToMode = useCallback(
		(
			newMode: FileViewerMode,
			location?: {
				line?: number;
				column?: number;
			},
		) => {
			updateFileViewer((current) => ({
				...current,
				viewMode: newMode,
				initialLine: location?.line ?? current.initialLine,
				initialColumn: location?.column ?? current.initialColumn,
			}));
		},
		[updateFileViewer],
	);

	const handleSwitchToRawAtLocation = (line: number, column: number) => {
		switchToMode("raw", { line, column });
	};

	const _handleViewModeChange = (value: string) => {
		if (!value) return;
		switchToMode(value as FileViewerMode);
	};

	const handleEditorSave = useCallback(() => {
		void performFileSave();
	}, [performFileSave]);

	const completePendingIntent = useCallback(() => {
		if (session?.pendingIntent?.type === "close-pane") {
			cancelPendingIntent(paneId);
			onRequestClose();
			return;
		}
		resumePendingIntent(paneId);
	}, [onRequestClose, paneId, session?.pendingIntent?.type]);

	const handleSavePendingIntent = useCallback(async () => {
		setIsResolvingIntent(true);
		const result = await performFileSave();
		if (result?.status === "saved") {
			completePendingIntent();
		}
		setIsResolvingIntent(false);
	}, [completePendingIntent, performFileSave]);

	const handleDiscardPendingIntent = useCallback(() => {
		if (
			session?.pendingIntent?.type === "change-view-mode" ||
			(documentState?.sessionPaneIds.length ?? 0) <= 1
		) {
			discardDocumentChanges(documentKey);
		}
		completePendingIntent();
	}, [
		completePendingIntent,
		documentKey,
		documentState?.sessionPaneIds.length,
		session?.pendingIntent?.type,
	]);

	const handleCloseUnsavedDialog = useCallback(
		(open: boolean) => {
			if (!open) {
				cancelPendingIntent(paneId);
			}
		},
		[paneId],
	);

	const handleReloadFromDisk = useCallback(() => {
		const nextDiskContent =
			saveConflict?.diskContent ??
			(rawFileData?.ok === true ? rawFileData.content : "");

		applyLoadedDocumentContent(
			documentKey,
			nextDiskContent,
			rawRevision ?? workingCopyRevision ?? null,
		);
		clearDocumentConflict(documentKey);
		useEditorSessionsStore.getState().patchSession(paneId, {
			dialog: "none",
		});
		invalidateCurrentFile();

		if (useEditorSessionsStore.getState().sessions[paneId]?.pendingIntent) {
			resumePendingIntent(paneId);
		}
	}, [
		documentKey,
		invalidateCurrentFile,
		paneId,
		rawFileData,
		rawRevision,
		saveConflict,
		workingCopyRevision,
	]);

	const handleOverwriteSave = useCallback(async () => {
		const result = await performFileSave({ force: true });
		if (result?.status !== "saved") {
			return;
		}

		clearDocumentConflict(documentKey);
		useEditorSessionsStore.getState().patchSession(paneId, {
			dialog: "none",
		});
		if (useEditorSessionsStore.getState().sessions[paneId]?.pendingIntent) {
			resumePendingIntent(paneId);
		}
	}, [documentKey, paneId, performFileSave]);

	const currentDocumentContent = getEditorDocumentCurrentContent(documentKey);
	const renderedContent = useMemo(() => {
		if (hasEditorDocumentInitialized(documentKey)) {
			return currentDocumentContent;
		}

		if (rawFileData?.ok === true) {
			return rawFileData.content;
		}

		return "";
	}, [currentDocumentContent, documentKey, rawFileData]);
	const unsavedDialogCopy = getUnsavedDialogCopy(
		session?.pendingIntent ?? null,
	);

	return (
		<>
			<div className="h-full w-full overflow-hidden bg-background">
				<div className="flex h-full min-h-0 flex-col">
					{hasExternalDiskChange && (
						<div className="border-b px-3 py-2">
							<Alert variant="destructive">
								<AlertTitle>File changed on disk</AlertTitle>
								<AlertDescription>
									This editor has unsaved changes. Saving now will require
									confirming the diff before overwriting the file.
									<div className="mt-2 flex gap-2">
										<Button
											size="sm"
											variant="outline"
											onClick={handleReloadFromDisk}
										>
											Reload From Disk
										</Button>
										<Button
											size="sm"
											onClick={() => {
												setDocumentConflict(
													documentKey,
													rawFileData?.ok === true ? rawFileData.content : null,
													paneId,
												);
											}}
										>
											Review Diff
										</Button>
									</div>
								</AlertDescription>
							</Alert>
						</div>
					)}
					<div className="min-h-0 flex-1">
						<FileViewerContent
							viewMode={viewMode}
							filePath={filePath}
							isLoadingRaw={isLoadingRaw}
							isLoadingImage={isLoadingImage}
							isLoadingDiff={isLoadingDiff}
							rawFileData={rawFileData}
							imageData={imageData}
							diffData={diffData}
							editorRef={editorRef}
							markdownEditorRef={markdownEditorRef}
							renderedContent={renderedContent}
							initialLine={initialLine}
							initialColumn={initialColumn}
							diffViewMode={diffViewMode}
							hideUnchangedRegions={hideUnchangedRegions}
							onSaveFile={handleEditorSave}
							onContentChange={handleContentChange}
							onSwitchToRawAtLocation={handleSwitchToRawAtLocation}
							onSplitHorizontal={() => {}}
							onSplitVertical={() => {}}
							onEqualizePaneSplits={() => {}}
							onClosePane={onRequestClose}
							currentTabId={tabId}
							availableTabs={[]}
							onMoveToTab={() => {}}
							onMoveToNewTab={() => {}}
							diffContainerRef={diffContainerRef}
							diffSearch={diffSearch}
							markdownContainerRef={markdownContainerRef}
							markdownSearch={markdownSearch}
						/>
					</div>
				</div>
			</div>
			<UnsavedChangesDialog
				open={unsavedDialogOpen}
				onOpenChange={handleCloseUnsavedDialog}
				onSave={handleSavePendingIntent}
				onDiscard={handleDiscardPendingIntent}
				isSaving={isResolvingIntent}
				description={unsavedDialogCopy.description}
				discardLabel={unsavedDialogCopy.discardLabel}
				saveLabel={unsavedDialogCopy.saveLabel}
			/>
			<FileSaveConflictDialog
				open={conflictDialogOpen}
				onOpenChange={(open) => {
					if (!open) {
						clearDocumentConflict(documentKey);
						useEditorSessionsStore.getState().patchSession(paneId, {
							dialog: "none",
						});
					}
				}}
				filePath={filePath}
				localContent={getCurrentContent()}
				diskContent={saveConflict?.diskContent ?? null}
				isSaving={isSaving}
				onKeepEditing={() => {
					clearDocumentConflict(documentKey);
					useEditorSessionsStore.getState().patchSession(paneId, {
						dialog: "none",
					});
				}}
				onReloadFromDisk={handleReloadFromDisk}
				onOverwrite={() => {
					void handleOverwriteSave();
				}}
			/>
		</>
	);
}
