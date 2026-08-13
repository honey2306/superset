import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	closePane,
	createFileViewer,
	findPanesStoreByPaneId,
	findPanesStoreByTabId,
	focusPane as focusPanesPane,
	type OpenFileOptions,
} from "renderer/lib/panes";
import { confirmCloseTerminals } from "renderer/lib/terminal/confirm-close-terminals";
import { getHostTerminalBackend } from "renderer/screens/main/components/WorkspaceView/ContentView/components/Terminal/host-terminal-backend";
import {
	deleteDocumentBuffer,
	discardDocumentCurrentContent,
	getDocumentBaselineContent,
	getDocumentCurrentContent,
	hasInitializedDocumentBuffer,
	markDocumentSavedContent,
	setDocumentCurrentContent,
	setDocumentLoadedContent,
	transferDocumentBuffer,
} from "./editorBufferRegistry";
import {
	buildEditorDocumentKey,
	type EditorDocumentState,
	type EditorPendingIntent,
	type EditorSaveResult,
	type FileViewerDocumentIdentity,
	isEditableFileViewerDocument,
} from "./types";
import { useEditorDocumentsStore } from "./useEditorDocumentsStore";
import { useEditorSessionsStore } from "./useEditorSessionsStore";

const MAX_FILE_SIZE = 2 * 1024 * 1024;

function getDocumentState(
	documentKey: string,
): EditorDocumentState | undefined {
	return useEditorDocumentsStore.getState().documents[documentKey];
}

function focusPane(paneId: string): void {
	const found = findPanesStoreByPaneId(paneId);
	if (found) focusPanesPane(found.workspaceId, paneId);
}

function cleanupDocumentIfOrphaned(documentKey: string): void {
	const document = getDocumentState(documentKey);
	if (document && document.sessionPaneIds.length > 0) {
		return;
	}

	useEditorDocumentsStore.getState().removeDocument(documentKey);
	deleteDocumentBuffer(documentKey);
}

function applyFileViewerReplacement(
	paneId: string,
	_workspaceId: string,
	options: OpenFileOptions,
): void {
	const found = findPanesStoreByPaneId(paneId);
	const location = found?.store.getState().getPane(paneId);
	if (!found || !location?.pane.data.fileViewer) return;
	found.store.getState().setPaneData({
		paneId,
		data: {
			...location.pane.data,
			fileViewer: createFileViewer(options),
		},
	});
	found.store.getState().setActivePane({ tabId: location.tabId, paneId });
}

function executePendingIntent(
	paneId: string,
	intent: EditorPendingIntent,
): void {
	const found = findPanesStoreByPaneId(paneId);
	switch (intent.type) {
		case "close-pane":
			if (found) closePane(found.workspaceId, paneId);
			return;
		case "close-tab": {
			const tab = findPanesStoreByTabId(intent.tabId);
			if (tab) tab.store.getState().removeTab(intent.tabId);
			return;
		}
		case "change-view-mode": {
			const location = found?.store.getState().getPane(paneId);
			const viewer = location?.pane.data.fileViewer;
			if (!found || !viewer) return;
			found.store.getState().setPaneData({
				paneId,
				data: {
					...location.pane.data,
					fileViewer: { ...viewer, viewMode: intent.nextMode },
				},
			});
			return;
		}
		case "replace-preview":
			applyFileViewerReplacement(paneId, intent.workspaceId, intent.options);
			return;
		case "quit-app":
			return;
	}
}

function collectDirtyTabDocuments(
	tabId: string,
): Array<{ documentKey: string; paneId: string }> {
	const found = findPanesStoreByTabId(tabId);
	const tab = found?.store.getState().getTab(tabId);
	if (!tab) return [];
	const sessions = useEditorSessionsStore.getState().sessions;
	const documents = useEditorDocumentsStore.getState().documents;
	const seen = new Set<string>();
	const dirtyDocs: Array<{ documentKey: string; paneId: string }> = [];
	for (const pane of Object.values(tab.panes)) {
		if (pane.kind !== "file-viewer") continue;
		const session = sessions[pane.id];
		if (!session) continue;
		const document = documents[session.documentKey];
		if (!document?.dirty || seen.has(session.documentKey)) continue;
		seen.add(session.documentKey);
		dirtyDocs.push({ documentKey: session.documentKey, paneId: pane.id });
	}
	return dirtyDocs;
}

function isDocumentExclusivelyBoundToTab(
	documentKey: string,
	tabId: string,
): boolean {
	const document = getDocumentState(documentKey);
	if (!document) return true;
	return document.sessionPaneIds.every(
		(paneId) =>
			findPanesStoreByPaneId(paneId)?.store.getState().getPane(paneId)
				?.tabId === tabId,
	);
}

export function bindFileViewerSession(
	paneId: string,
	identity: FileViewerDocumentIdentity,
	options?: {
		preserveDocumentState?: boolean;
	},
): string {
	const documentKey = buildEditorDocumentKey(identity);
	const documentsStore = useEditorDocumentsStore.getState();
	const sessionsStore = useEditorSessionsStore.getState();
	const currentSession = sessionsStore.sessions[paneId];
	const previousDocumentKey = currentSession?.documentKey;
	const previousDocument = previousDocumentKey
		? documentsStore.documents[previousDocumentKey]
		: undefined;
	const shouldPreserveDocumentState = Boolean(
		previousDocumentKey &&
			previousDocumentKey !== documentKey &&
			previousDocument &&
			options?.preserveDocumentState,
	);

	if (previousDocumentKey && previousDocumentKey !== documentKey) {
		if (shouldPreserveDocumentState && previousDocument) {
			documentsStore.replaceDocumentKey(previousDocumentKey, {
				...previousDocument,
				documentKey,
				workspaceId: identity.workspaceId,
				filePath: identity.filePath,
				isEditable: isEditableFileViewerDocument(identity),
			});
			sessionsStore.replaceDocumentKey(previousDocumentKey, documentKey);
			transferDocumentBuffer(previousDocumentKey, documentKey);
		} else {
			documentsStore.removeSessionBinding(previousDocumentKey, paneId);
			cleanupDocumentIfOrphaned(previousDocumentKey);
		}
	}

	documentsStore.upsertDocument({
		documentKey,
		workspaceId: identity.workspaceId,
		filePath: identity.filePath,
		status: getDocumentState(documentKey)?.status ?? "loading",
		dirty: getDocumentState(documentKey)?.dirty ?? false,
		baselineRevision: getDocumentState(documentKey)?.baselineRevision ?? null,
		hasExternalDiskChange:
			getDocumentState(documentKey)?.hasExternalDiskChange ?? false,
		conflict: getDocumentState(documentKey)?.conflict ?? null,
		isEditable: isEditableFileViewerDocument(identity),
	});
	documentsStore.addSessionBinding(documentKey, paneId);
	sessionsStore.bindSession(paneId, documentKey);

	return documentKey;
}

export function unbindFileViewerSession(paneId: string): void {
	const session = useEditorSessionsStore.getState().sessions[paneId];
	if (!session) {
		return;
	}

	useEditorDocumentsStore
		.getState()
		.removeSessionBinding(session.documentKey, paneId);
	useEditorSessionsStore.getState().clearSession(paneId);
	cleanupDocumentIfOrphaned(session.documentKey);
}

export function updateDocumentDraft(
	documentKey: string,
	content: string,
): boolean {
	setDocumentCurrentContent(documentKey, content);
	const baseline = getDocumentBaselineContent(documentKey);
	const dirty = content !== baseline;

	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		dirty,
		status: "ready",
		contentVersion: (getDocumentState(documentKey)?.contentVersion ?? 0) + 1,
	});

	return dirty;
}

export function applyLoadedDocumentContent(
	documentKey: string,
	content: string,
	revision: string | null,
): void {
	setDocumentLoadedContent(documentKey, content);
	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		dirty: false,
		baselineRevision: revision,
		status: "ready",
		conflict: null,
		hasExternalDiskChange: false,
		contentVersion: (getDocumentState(documentKey)?.contentVersion ?? 0) + 1,
	});
}

export function markDocumentSaved(
	documentKey: string,
	options: {
		savedContent: string;
		currentContent: string;
		revision: string;
	},
): void {
	markDocumentSavedContent(
		documentKey,
		options.savedContent,
		options.currentContent,
	);
	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		dirty: options.currentContent !== options.savedContent,
		baselineRevision: options.revision,
		status: "ready",
		conflict: null,
		hasExternalDiskChange: false,
		contentVersion: (getDocumentState(documentKey)?.contentVersion ?? 0) + 1,
	});
}

export function discardDocumentChanges(documentKey: string): string {
	const nextContent = discardDocumentCurrentContent(documentKey);
	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		dirty: false,
		status: "ready",
		conflict: null,
		hasExternalDiskChange: false,
		contentVersion: (getDocumentState(documentKey)?.contentVersion ?? 0) + 1,
	});
	return nextContent;
}

export function setDocumentSaving(
	documentKey: string,
	isSaving: boolean,
): void {
	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		status: isSaving ? "saving" : "ready",
	});
}

export function setDocumentConflict(
	documentKey: string,
	diskContent: string | null,
	representativePaneId?: string,
): void {
	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		status: "conflict",
		conflict: {
			diskContent,
		},
	});

	const document = getDocumentState(documentKey);
	const paneId = representativePaneId ?? document?.sessionPaneIds[0];
	if (!paneId) {
		return;
	}

	focusPane(paneId);
	useEditorSessionsStore.getState().patchSession(paneId, {
		dialog: "conflict",
	});
}

export function clearDocumentConflict(documentKey: string): void {
	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		status: "ready",
		conflict: null,
	});
}

export function setDocumentExternalDiskChange(
	documentKey: string,
	hasExternalDiskChange: boolean,
): void {
	useEditorDocumentsStore.getState().patchDocument(documentKey, {
		hasExternalDiskChange,
	});
}

export function getEditorDocumentCurrentContent(documentKey: string): string {
	return getDocumentCurrentContent(documentKey);
}

export function getEditorDocumentBaselineContent(documentKey: string): string {
	return getDocumentBaselineContent(documentKey);
}

export function hasEditorDocumentInitialized(documentKey: string): boolean {
	return hasInitializedDocumentBuffer(documentKey);
}

export async function saveDocumentForPane(
	paneId: string,
	options?: {
		force?: boolean;
	},
): Promise<EditorSaveResult | undefined> {
	const found = findPanesStoreByPaneId(paneId);
	const pane = found?.store.getState().getPane(paneId)?.pane;
	const session = useEditorSessionsStore.getState().sessions[paneId];
	if (!pane?.data.fileViewer || !session) {
		return undefined;
	}

	const document =
		useEditorDocumentsStore.getState().documents[session.documentKey];
	if (!document?.workspaceId || !document.filePath) {
		return undefined;
	}

	const content = getDocumentCurrentContent(document.documentKey);
	const precondition =
		options?.force || !document.baselineRevision
			? undefined
			: { ifMatch: document.baselineRevision };

	const backend = getHostTerminalBackend(document.workspaceId);
	if (!backend) {
		throw new Error(
			`Host filesystem backend not available: ${document.workspaceId}`,
		);
	}
	const filesystem = getHostServiceClientByUrl(backend.hostUrl).filesystem;
	const result = await filesystem.writeFile.mutate({
		workspaceId: document.workspaceId,
		absolutePath: document.filePath,
		content,
		encoding: "utf-8",
		precondition,
	});

	if (!result.ok) {
		if (result.reason === "conflict") {
			try {
				const currentFile = await filesystem.readFile.query({
					workspaceId: document.workspaceId,
					absolutePath: document.filePath,
					encoding: "utf-8",
					maxBytes: MAX_FILE_SIZE,
				});
				setDocumentConflict(
					document.documentKey,
					(currentFile.content as string) ?? null,
					paneId,
				);
				return {
					status: "conflict",
					currentContent: (currentFile.content as string) ?? null,
				};
			} catch (error) {
				console.error(
					"[editorCoordinator] Failed to read disk content after save conflict",
					{
						documentKey: document.documentKey,
						filePath: document.filePath,
						error,
					},
				);
				setDocumentConflict(document.documentKey, null, paneId);
				return { status: "conflict", currentContent: null };
			}
		}
		return undefined;
	}

	const currentContent = getDocumentCurrentContent(document.documentKey);
	markDocumentSaved(document.documentKey, {
		savedContent: content,
		currentContent,
		revision: result.revision,
	});

	if (pane.data.fileViewer.diffCategory === "staged" && found) {
		found.store.getState().setPaneData({
			paneId,
			data: {
				...pane.data,
				fileViewer: { ...pane.data.fileViewer, diffCategory: "unstaged" },
			},
		});
	}

	return { status: "saved" };
}

export function requestViewModeChange(
	paneId: string,
	nextMode: import("shared/tabs-types").FileViewerMode,
): boolean {
	// Defense in depth: reject anything that isn't a valid FileViewerMode. Radix
	// ToggleGroup can emit "" on deselect, and a bad value here corrupts the
	// persisted state (tRPC then rejects every subsequent flush).
	if (nextMode !== "rendered" && nextMode !== "raw" && nextMode !== "diff") {
		return true;
	}

	const pane = findPanesStoreByPaneId(paneId)
		?.store.getState()
		.getPane(paneId)?.pane;
	if (!pane?.data.fileViewer || pane.data.fileViewer.viewMode === nextMode) {
		return true;
	}

	const session = useEditorSessionsStore.getState().sessions[paneId];
	const document = session
		? useEditorDocumentsStore.getState().documents[session.documentKey]
		: null;

	if (document?.dirty) {
		focusPane(paneId);
		useEditorSessionsStore
			.getState()
			.setPendingIntent(
				paneId,
				{ type: "change-view-mode", nextMode },
				"unsaved",
			);
		return false;
	}

	executePendingIntent(paneId, { type: "change-view-mode", nextMode });
	return true;
}

export function requestPaneClose(paneId: string): boolean {
	const found = findPanesStoreByPaneId(paneId);
	const location = found?.store.getState().getPane(paneId);
	if (!found || !location) return true;
	const pane = location.pane;
	if (pane.kind === "terminal") {
		const backend = getHostTerminalBackend(found.workspaceId);
		const terminalId = pane.data.terminalId ?? paneId;
		if (backend) {
			void confirmCloseTerminals(
				[terminalId],
				async (id) =>
					(
						await getHostServiceClientByUrl(
							backend.hostUrl,
						).terminal.hasRunningProcess.query({
							terminalId: id,
							workspaceId: backend.hostWorkspaceId,
						})
					).running,
				{
					title: "Close terminal?",
					description: "A process is still running in this terminal.",
					confirmLabel: "Close terminal",
				},
			).then((confirmed) => {
				if (confirmed) closePane(found.workspaceId, paneId);
			});
			return false;
		}
	}
	if (pane.kind === "file-viewer") {
		const session = useEditorSessionsStore.getState().sessions[paneId];
		const document = session
			? useEditorDocumentsStore.getState().documents[session.documentKey]
			: null;
		if (document?.dirty) {
			focusPane(paneId);
			useEditorSessionsStore
				.getState()
				.setPendingIntent(paneId, { type: "close-pane" }, "unsaved");
			return false;
		}
	}
	closePane(found.workspaceId, paneId);
	return true;
}

export function requestPreviewReplacement(
	paneId: string,
	workspaceId: string,
	options: OpenFileOptions,
): boolean {
	const session = useEditorSessionsStore.getState().sessions[paneId];
	const document = session
		? useEditorDocumentsStore.getState().documents[session.documentKey]
		: null;

	if (document?.dirty) {
		focusPane(paneId);
		useEditorSessionsStore.getState().setPendingIntent(
			paneId,
			{
				type: "replace-preview",
				workspaceId,
				options,
			},
			"unsaved",
		);
		return false;
	}

	applyFileViewerReplacement(paneId, workspaceId, options);
	return true;
}

export function requestTabClose(tabId: string): boolean {
	const found = findPanesStoreByTabId(tabId);
	const tab = found?.store.getState().getTab(tabId);
	if (!found || !tab) return true;
	const dirtyDocs = collectDirtyTabDocuments(tabId);
	if (dirtyDocs.length > 0) {
		useEditorSessionsStore.getState().setPendingTabClose({
			workspaceId: found.workspaceId,
			tabId,
			paneIds: dirtyDocs.map((entry) => entry.paneId),
			documentKeys: dirtyDocs.map((entry) => entry.documentKey),
			isSaving: false,
		});
		return false;
	}
	const terminalIds = Object.values(tab.panes)
		.filter((pane) => pane.kind === "terminal")
		.map((pane) => pane.data.terminalId ?? pane.id);
	const backend = getHostTerminalBackend(found.workspaceId);
	if (backend && terminalIds.length > 0) {
		void confirmCloseTerminals(
			terminalIds,
			async (terminalId) =>
				(
					await getHostServiceClientByUrl(
						backend.hostUrl,
					).terminal.hasRunningProcess.query({
						terminalId,
						workspaceId: backend.hostWorkspaceId,
					})
				).running,
			{
				title: "Close tab?",
				description: "One or more terminal processes are still running.",
				confirmLabel: "Close tab",
			},
		).then((confirmed) => {
			if (confirmed) found.store.getState().removeTab(tabId);
		});
		return false;
	}
	found.store.getState().removeTab(tabId);
	return true;
}

export function cancelPendingIntent(paneId: string): void {
	useEditorSessionsStore.getState().setPendingIntent(paneId, null, "none");
}

export function resumePendingIntent(paneId: string): void {
	const session = useEditorSessionsStore.getState().sessions[paneId];
	if (!session?.pendingIntent) {
		return;
	}

	const intent = session.pendingIntent;
	useEditorSessionsStore.getState().setPendingIntent(paneId, null, "none");
	executePendingIntent(paneId, intent);
}

export function getPaneDocumentKey(paneId: string): string | null {
	return (
		useEditorSessionsStore.getState().sessions[paneId]?.documentKey ?? null
	);
}

export function isPaneDocumentDirty(paneId: string): boolean {
	const session = useEditorSessionsStore.getState().sessions[paneId];
	if (!session) {
		return false;
	}

	return Boolean(
		useEditorDocumentsStore.getState().documents[session.documentKey]?.dirty,
	);
}

export async function saveAndClosePendingTab(
	workspaceId: string,
): Promise<void> {
	const pending = useEditorSessionsStore.getState().pendingTabClose;
	if (!pending || pending.isSaving || pending.workspaceId !== workspaceId) {
		return;
	}

	useEditorSessionsStore
		.getState()
		.setPendingTabClose({ ...pending, isSaving: true });

	try {
		for (const paneId of pending.paneIds) {
			const result: EditorSaveResult | undefined =
				await saveDocumentForPane(paneId);
			if (!result) {
				const currentPending =
					useEditorSessionsStore.getState().pendingTabClose;
				if (
					currentPending?.tabId === pending.tabId &&
					currentPending.workspaceId === workspaceId
				) {
					useEditorSessionsStore
						.getState()
						.setPendingTabClose({ ...currentPending, isSaving: false });
				}
				return;
			}

			if (result.status === "conflict") {
				useEditorSessionsStore.getState().setPendingTabClose(null);
				return;
			}
		}
	} catch (error) {
		console.error("[editorCoordinator] Failed to save before closing tab", {
			tabId: pending.tabId,
			workspaceId,
			error,
		});
		const currentPending = useEditorSessionsStore.getState().pendingTabClose;
		if (
			currentPending?.tabId === pending.tabId &&
			currentPending.workspaceId === workspaceId
		) {
			useEditorSessionsStore
				.getState()
				.setPendingTabClose({ ...currentPending, isSaving: false });
		}
		return;
	}

	useEditorSessionsStore.getState().setPendingTabClose(null);
	findPanesStoreByTabId(pending.tabId)
		?.store.getState()
		.removeTab(pending.tabId);
}

export function discardAndClosePendingTab(workspaceId: string): void {
	const pending = useEditorSessionsStore.getState().pendingTabClose;
	if (!pending || pending.workspaceId !== workspaceId) {
		return;
	}

	for (const documentKey of pending.documentKeys) {
		if (isDocumentExclusivelyBoundToTab(documentKey, pending.tabId)) {
			discardDocumentChanges(documentKey);
		}
	}

	useEditorSessionsStore.getState().setPendingTabClose(null);
	findPanesStoreByTabId(pending.tabId)
		?.store.getState()
		.removeTab(pending.tabId);
}

export function cancelPendingTabClose(workspaceId: string): void {
	const pending = useEditorSessionsStore.getState().pendingTabClose;
	if (!pending || pending.workspaceId !== workspaceId) {
		return;
	}

	useEditorSessionsStore.getState().setPendingTabClose(null);
}
