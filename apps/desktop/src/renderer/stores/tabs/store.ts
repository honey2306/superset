import type { MosaicNode } from "react-mosaic-component";
import { updateTree } from "react-mosaic-component";
import { getFileOpenMode } from "renderer/hooks/useFileOpenMode";
import { posthog } from "renderer/lib/posthog";
import { trpcTabsStorage } from "renderer/lib/trpc-storage";
import { openCommentInPanesStore } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/V1PanesWorkspace/openCommentInPanesStore";
import { openFileViewerInPanesStore } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/V1PanesWorkspace/openFileViewerInPanesStore";
import { getV1PanesStore } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/V1PanesWorkspace/v1PanesStoreRegistry";
import { deleteDocumentBuffer } from "renderer/stores/editor-state/editorBufferRegistry";
import { useEditorDocumentsStore } from "renderer/stores/editor-state/useEditorDocumentsStore";
import { useEditorSessionsStore } from "renderer/stores/editor-state/useEditorSessionsStore";
import {
	getPathBaseName,
	pathsMatch,
	retargetAbsolutePath,
} from "shared/absolute-paths";
import { acknowledgedStatus } from "shared/tabs-types";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import {
	mergeTabIntoTab,
	movePaneToNewTab,
	movePaneToTab,
} from "./actions/move-pane";
import type {
	AddFileViewerPaneOptions,
	AddTabWithMultiplePanesOptions,
	CommentPaneData,
	TabsState,
	TabsStore,
} from "./types";
import {
	activatePaneInWorkspace,
	applyFileViewerOpenOptionsToPane,
	buildMultiPaneLayout,
	type CreatePaneOptions,
	cleanLayout,
	createCommentTabWithPane,
	createFileViewerPane,
	createPane,
	createTabWithPane,
	equalizeSplitPercentages,
	extractPaneIdsFromLayout,
	findReusableFileViewerPane,
	generateId,
	generateTabName,
	getAdjacentPaneId,
	getFirstPaneId,
	getPaneIdsForTab,
	isLastPaneInTab,
	removePaneFromLayout,
	resolveActiveTabIdForWorkspace,
	resolveFileViewerMode,
} from "./utils";
import { killTerminalForPane } from "./utils/terminal-cleanup";

/**
 * Finds the next best tab to activate when closing a tab.
 * Priority order:
 * 1. Most recently used tab from history stack
 * 2. Next/previous tab by position
 * 3. Any remaining tab in the workspace
 */
const findNextTab = (state: TabsState, tabIdToClose: string): string | null => {
	const tabToClose = state.tabs.find((t) => t.id === tabIdToClose);
	if (!tabToClose) return null;

	const workspaceId = tabToClose.workspaceId;
	const workspaceTabs = state.tabs.filter(
		(t) => t.workspaceId === workspaceId && t.id !== tabIdToClose,
	);

	if (workspaceTabs.length === 0) return null;

	// Try history first
	const historyStack = state.tabHistoryStacks[workspaceId] || [];
	for (const historyTabId of historyStack) {
		if (historyTabId === tabIdToClose) continue;
		if (workspaceTabs.some((t) => t.id === historyTabId)) {
			return historyTabId;
		}
	}

	// Try position-based (next, then previous)
	const allWorkspaceTabs = state.tabs.filter(
		(t) => t.workspaceId === workspaceId,
	);
	const currentIndex = allWorkspaceTabs.findIndex((t) => t.id === tabIdToClose);

	if (currentIndex !== -1) {
		const nextIndex = currentIndex + 1;
		const prevIndex = currentIndex - 1;

		if (
			nextIndex < allWorkspaceTabs.length &&
			allWorkspaceTabs[nextIndex].id !== tabIdToClose
		) {
			return allWorkspaceTabs[nextIndex].id;
		}
		if (prevIndex >= 0 && allWorkspaceTabs[prevIndex].id !== tabIdToClose) {
			return allWorkspaceTabs[prevIndex].id;
		}
	}

	// Fallback to first available
	return workspaceTabs[0]?.id || null;
};

const normalizePersistedChatPane = (pane: TabsState["panes"][string]): void => {
	// biome-ignore lint/suspicious/noExplicitAny: persisted chat panes may use legacy keys/shapes
	const legacyPane = pane as any;
	const legacyChatState = legacyPane.chat ?? legacyPane.chatMastra;

	if (
		legacyPane.type !== "chat" &&
		legacyPane.type !== "chat-mastra" &&
		!legacyChatState
	) {
		return;
	}

	legacyPane.type = "chat";
	legacyPane.chat = {
		sessionId: legacyChatState?.sessionId ?? null,
		launchConfig: legacyChatState?.launchConfig ?? null,
	};
	delete legacyPane.chatMastra;
};

/**
 * Drop persisted chat panes after the chat feature was removed.
 *
 * Chat panes no longer render (no registry entry / no `Pane.chat` shape),
 * so a persisted chat pane would either show "Unknown pane kind" (v2 panes)
 * or fall through to the terminal renderer keyed by the chat pane id (v1
 * mosaic). To avoid dead/broken panes on load, the v10 migration drops any
 * pane whose type is `chat` (or the legacy `chat-mastra`) and repairs every
 * tab's Mosaic layout with `cleanLayout`. Tabs whose layout becomes empty
 * are dropped; `closedTabsStack` entries are pruned of chat panes (and
 * dropped if left empty) so "reopen closed tab" can't resurrect chat.
 */
const stripChatPanes = (state: TabsState): void => {
	if (!state.panes) return;

	const chatPaneIds = new Set(
		Object.entries(state.panes)
			.filter(([, pane]) => {
				const type = (pane as { type: string }).type;
				return type === "chat" || type === "chat-mastra";
			})
			.map(([id]) => id),
	);
	if (chatPaneIds.size === 0) return;

	const nextPanes: TabsState["panes"] = {};
	for (const [id, pane] of Object.entries(state.panes)) {
		if (!chatPaneIds.has(id)) nextPanes[id] = pane;
	}
	state.panes = nextPanes;

	if (state.tabs) {
		const survivingTabs = state.tabs.filter((tab) => {
			const cleaned = cleanLayout(tab.layout, new Set(Object.keys(nextPanes)));
			if (!cleaned) return false;
			tab.layout = cleaned;
			return true;
		});
		state.tabs = survivingTabs;
	}

	if (state.activeTabIds) {
		for (const [workspaceId, tabId] of Object.entries(state.activeTabIds)) {
			if (tabId && !state.tabs.some((t) => t.id === tabId)) {
				state.activeTabIds[workspaceId] = null;
			}
		}
	}

	if (state.closedTabsStack) {
		state.closedTabsStack = state.closedTabsStack
			.map((entry) => ({
				...entry,
				panes: entry.panes.filter((p) => !chatPaneIds.has(p.id)),
			}))
			.filter((entry) => entry.panes.length > 0);
	}
};

const deriveTabName = (
	panes: Record<string, { tabId: string; name: string }>,
	tabId: string,
): string => {
	const tabPanes = Object.values(panes).filter((p) => p.tabId === tabId);
	if (tabPanes.length === 1) return tabPanes[0].name;
	return `Multiple panes (${tabPanes.length})`;
};

type TabsMoveStateUpdate = Pick<
	TabsState,
	"tabs" | "panes" | "activeTabIds" | "focusedPaneIds" | "tabHistoryStacks"
>;

const withDerivedTabNames = (
	state: TabsMoveStateUpdate,
	tabIds: Iterable<string | undefined>,
): TabsMoveStateUpdate => {
	const affectedTabIds = new Set<string>();
	for (const tabId of tabIds) {
		if (tabId) {
			affectedTabIds.add(tabId);
		}
	}

	if (affectedTabIds.size === 0) {
		return state;
	}

	return {
		...state,
		tabs: state.tabs.map((tab) =>
			affectedTabIds.has(tab.id)
				? { ...tab, name: deriveTabName(state.panes, tab.id) }
				: tab,
		),
	};
};

const cleanupEditorPaneState = (paneId: string): void => {
	const sessionsStore = useEditorSessionsStore.getState();
	const session = sessionsStore.sessions[paneId];
	if (!session) {
		return;
	}

	useEditorDocumentsStore
		.getState()
		.removeSessionBinding(session.documentKey, paneId);
	sessionsStore.clearSession(paneId);

	const document =
		useEditorDocumentsStore.getState().documents[session.documentKey];
	if (document && document.sessionPaneIds.length > 0) {
		return;
	}

	useEditorDocumentsStore.getState().removeDocument(session.documentKey);
	deleteDocumentBuffer(session.documentKey);
};

export const useTabsStore = create<TabsStore>()(
	devtools(
		persist(
			(set, get) => ({
				tabs: [],
				panes: {},
				activeTabIds: {},
				focusedPaneIds: {},
				tabHistoryStacks: {},
				closedTabsStack: [],

				// Tab operations
				addTab: (workspaceId, options?: CreatePaneOptions) => {
					const state = get();

					const { tab, pane } = createTabWithPane(
						workspaceId,
						state.tabs,
						options,
					);

					const currentActiveId = state.activeTabIds[workspaceId];
					const historyStack = state.tabHistoryStacks[workspaceId] || [];
					const newHistoryStack = currentActiveId
						? [
								currentActiveId,
								...historyStack.filter((id) => id !== currentActiveId),
							]
						: historyStack;

					set({
						tabs: [...state.tabs, tab],
						panes: { ...state.panes, [pane.id]: pane },
						activeTabIds: {
							...state.activeTabIds,
							[workspaceId]: tab.id,
						},
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tab.id]: pane.id,
						},
						tabHistoryStacks: {
							...state.tabHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
					});

					posthog.capture("panel_opened", {
						panel_type: "terminal",
						workspace_id: workspaceId,
						pane_id: pane.id,
					});

					return { tabId: tab.id, paneId: pane.id };
				},

				addTabWithMultiplePanes: (
					workspaceId: string,
					options: AddTabWithMultiplePanesOptions,
				) => {
					const state = get();
					const tabId = generateId("tab");
					const panes: ReturnType<typeof createPane>[] = options.commands.map(
						(_command) =>
							createPane(tabId, "terminal", {
								initialCwd: options.initialCwd,
							}),
					);

					const paneIds = panes.map((p) => p.id);
					const layout = buildMultiPaneLayout(paneIds);
					const workspaceTabs = state.tabs.filter(
						(t) => t.workspaceId === workspaceId,
					);

					const tab = {
						id: tabId,
						name: generateTabName(workspaceTabs),
						workspaceId,
						layout,
						createdAt: Date.now(),
					};

					const panesRecord: Record<string, (typeof panes)[number]> = {};
					for (const pane of panes) {
						panesRecord[pane.id] = pane;
					}

					const currentActiveId = state.activeTabIds[workspaceId];
					const historyStack = state.tabHistoryStacks[workspaceId] || [];
					const newHistoryStack = currentActiveId
						? [
								currentActiveId,
								...historyStack.filter((id) => id !== currentActiveId),
							]
						: historyStack;

					set({
						tabs: [...state.tabs, tab],
						panes: { ...state.panes, ...panesRecord },
						activeTabIds: {
							...state.activeTabIds,
							[workspaceId]: tab.id,
						},
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tab.id]: paneIds[0],
						},
						tabHistoryStacks: {
							...state.tabHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
					});

					for (const paneId of paneIds) {
						posthog.capture("panel_opened", {
							panel_type: "terminal",
							workspace_id: workspaceId,
							pane_id: paneId,
						});
					}

					return { tabId: tab.id, paneIds };
				},

				removeTab: (tabId) => {
					const state = get();
					const tabToRemove = state.tabs.find((t) => t.id === tabId);
					if (!tabToRemove) return;

					const paneIds = getPaneIdsForTab(state.panes, tabId);

					// Snapshot the tab + panes for "reopen closed tab"
					const closedPanes = paneIds
						.map((id) => state.panes[id])
						.filter(Boolean);
					const closedEntry = {
						tab: tabToRemove,
						panes: closedPanes,
						closedAt: Date.now(),
					};
					const closedTabsStack = [closedEntry, ...state.closedTabsStack].slice(
						0,
						20,
					);

					for (const paneId of paneIds) {
						// Only kill terminal sessions for terminal panes (avoids unnecessary IPC for file-viewers)
						const pane = state.panes[paneId];
						if (pane?.type === "terminal") {
							killTerminalForPane(paneId);
						}

						cleanupEditorPaneState(paneId);
					}

					const newPanes = { ...state.panes };
					for (const paneId of paneIds) {
						delete newPanes[paneId];
					}

					const newTabs = state.tabs.filter((t) => t.id !== tabId);

					const workspaceId = tabToRemove.workspaceId;
					const newActiveTabIds = { ...state.activeTabIds };
					const newHistoryStack = (
						state.tabHistoryStacks[workspaceId] || []
					).filter((id) => id !== tabId);

					if (state.activeTabIds[workspaceId] === tabId) {
						newActiveTabIds[workspaceId] = findNextTab(state, tabId);
					}

					const newFocusedPaneIds = { ...state.focusedPaneIds };
					delete newFocusedPaneIds[tabId];

					set({
						tabs: newTabs,
						panes: newPanes,
						activeTabIds: newActiveTabIds,
						focusedPaneIds: newFocusedPaneIds,
						closedTabsStack,
						tabHistoryStacks: {
							...state.tabHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
					});
				},

				renameTab: (tabId, newName) => {
					set((state) => ({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, userTitle: newName } : t,
						),
					}));
				},

				setTabAutoTitle: (tabId, title) => {
					set((state) => {
						const tab = state.tabs.find((t) => t.id === tabId);
						if (!tab || tab.name === title || tab.userTitle?.trim()) {
							return state;
						}
						return {
							tabs: state.tabs.map((t) =>
								t.id === tabId ? { ...t, name: title } : t,
							),
						};
					});
				},

				setActiveTab: (workspaceId, tabId) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab || tab.workspaceId !== workspaceId) {
						return;
					}

					const currentActiveId = state.activeTabIds[workspaceId];
					const historyStack = state.tabHistoryStacks[workspaceId] || [];

					let newHistoryStack = historyStack.filter((id) => id !== tabId);
					if (currentActiveId && currentActiveId !== tabId) {
						newHistoryStack = [
							currentActiveId,
							...newHistoryStack.filter((id) => id !== currentActiveId),
						];
					}

					// Clear attention status for panes in the selected tab
					const tabPaneIds = extractPaneIdsFromLayout(tab.layout);
					const newPanes = { ...state.panes };
					let hasChanges = false;
					for (const paneId of tabPaneIds) {
						const resolved = acknowledgedStatus(newPanes[paneId]?.status);
						if (resolved !== (newPanes[paneId]?.status ?? "idle")) {
							newPanes[paneId] = { ...newPanes[paneId], status: resolved };
							hasChanges = true;
						}
					}

					set({
						activeTabIds: {
							...state.activeTabIds,
							[workspaceId]: tabId,
						},
						tabHistoryStacks: {
							...state.tabHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
						...(hasChanges ? { panes: newPanes } : {}),
					});
				},

				reorderTabs: (workspaceId, startIndex, endIndex) => {
					const state = get();
					const workspaceTabs = state.tabs.filter(
						(t) => t.workspaceId === workspaceId,
					);
					const otherTabs = state.tabs.filter(
						(t) => t.workspaceId !== workspaceId,
					);

					// Prevent corrupting state by splicing undefined elements
					if (
						startIndex < 0 ||
						startIndex >= workspaceTabs.length ||
						!Number.isInteger(startIndex)
					) {
						return;
					}

					// Prevent out-of-bounds writes that would insert undefined elements
					const clampedEndIndex = Math.max(
						0,
						Math.min(endIndex, workspaceTabs.length),
					);

					// Avoid mutating original state array to prevent side effects elsewhere
					const reorderedTabs = [...workspaceTabs];
					const [removed] = reorderedTabs.splice(startIndex, 1);
					reorderedTabs.splice(clampedEndIndex, 0, removed);

					set({ tabs: [...otherTabs, ...reorderedTabs] });
				},

				reorderTabById: (tabId, targetIndex) => {
					const state = get();
					const tabToMove = state.tabs.find((t) => t.id === tabId);
					if (!tabToMove) return;

					const workspaceId = tabToMove.workspaceId;
					const workspaceTabs = state.tabs.filter(
						(t) => t.workspaceId === workspaceId,
					);
					const otherTabs = state.tabs.filter(
						(t) => t.workspaceId !== workspaceId,
					);

					const currentIndex = workspaceTabs.findIndex((t) => t.id === tabId);
					if (currentIndex === -1) return;

					workspaceTabs.splice(currentIndex, 1);
					workspaceTabs.splice(targetIndex, 0, tabToMove);

					set({ tabs: [...otherTabs, ...workspaceTabs] });
				},

				updateTabLayout: (tabId, layout) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab) return;

					const newPaneIds = new Set(extractPaneIdsFromLayout(layout));
					const oldPaneIds = new Set(extractPaneIdsFromLayout(tab.layout));

					const removedPaneIds = Array.from(oldPaneIds).filter(
						(id) => !newPaneIds.has(id),
					);

					const newPanes = { ...state.panes };
					for (const paneId of removedPaneIds) {
						const pane = state.panes[paneId];
						// Only delete panes that actually belong to this tab
						// During drag operations, Mosaic may temporarily include foreign panes
						// in layouts - we must not delete those when they're "removed"
						if (pane && pane.tabId === tabId) {
							if (pane.type === "terminal") {
								killTerminalForPane(paneId);
							}
							delete newPanes[paneId];
						}
					}

					// Update focused pane if it was removed
					let newFocusedPaneIds = state.focusedPaneIds;
					const currentFocusedPaneId = state.focusedPaneIds[tabId];
					if (
						currentFocusedPaneId &&
						removedPaneIds.includes(currentFocusedPaneId)
					) {
						newFocusedPaneIds = {
							...state.focusedPaneIds,
							[tabId]: getFirstPaneId(layout),
						};
					}

					set({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, layout } : t,
						),
						panes: newPanes,
						focusedPaneIds: newFocusedPaneIds,
					});
				},

				equalizePaneSplits: (tabId) => {
					const tab = get().tabs.find((t) => t.id === tabId);
					if (!tab?.layout || typeof tab.layout === "string") return;
					const equalizedLayout = equalizeSplitPercentages(tab.layout);
					get().updateTabLayout(tabId, equalizedLayout);
				},

				// Pane operations
				addPane: (tabId, options?: CreatePaneOptions) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab) return "";

					const newPane = createPane(tabId, "terminal", options);

					const newLayout: MosaicNode<string> = {
						direction: "row",
						first: tab.layout,
						second: newPane.id,
						splitPercentage: 50,
					};

					const newPanes = { ...state.panes, [newPane.id]: newPane };
					const tabName = deriveTabName(newPanes, tabId);

					set({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, layout: newLayout, name: tabName } : t,
						),
						panes: newPanes,
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tabId]: newPane.id,
						},
					});

					posthog.capture("panel_opened", {
						panel_type: "terminal",
						workspace_id: tab.workspaceId,
						pane_id: newPane.id,
					});

					return newPane.id;
				},
				addPanesToTab: (
					tabId: string,
					options: AddTabWithMultiplePanesOptions,
				) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab) return [];

					const panes: ReturnType<typeof createPane>[] = options.commands.map(
						(_command) =>
							createPane(tabId, "terminal", {
								initialCwd: options.initialCwd,
							}),
					);

					const paneIds = panes.map((p) => p.id);
					const existingPaneIds = extractPaneIdsFromLayout(tab.layout);
					const allPaneIds = [...existingPaneIds, ...paneIds];
					const newLayout = buildMultiPaneLayout(allPaneIds);

					const panesRecord: Record<string, (typeof panes)[number]> = {
						...state.panes,
					};
					for (const pane of panes) {
						panesRecord[pane.id] = pane;
					}

					const tabName = deriveTabName(panesRecord, tabId);

					set({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, layout: newLayout, name: tabName } : t,
						),
						panes: panesRecord,
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tabId]: paneIds[0],
						},
					});

					for (const paneId of paneIds) {
						posthog.capture("panel_opened", {
							panel_type: "terminal",
							workspace_id: tab.workspaceId,
							pane_id: paneId,
						});
					}

					return paneIds;
				},

				addFileViewerPane: (
					workspaceId: string,
					options: AddFileViewerPaneOptions,
				) => {
					const panesStore = getV1PanesStore(workspaceId);
					if (panesStore) {
						return openFileViewerInPanesStore(panesStore, options);
					}

					if (options.openInNewTab === undefined) {
						options = {
							...options,
							openInNewTab: getFileOpenMode() === "new-tab",
						};
					}

					const state = get();
					const resolvedActiveTabId = resolveActiveTabIdForWorkspace({
						workspaceId,
						tabs: state.tabs,
						activeTabIds: state.activeTabIds,
						tabHistoryStacks: state.tabHistoryStacks,
					});
					const activeTab = resolvedActiveTabId
						? state.tabs.find((t) => t.id === resolvedActiveTabId)
						: null;

					// If no active tab, create a new one (this shouldn't normally happen)
					if (!activeTab) {
						const { tabId, paneId } = get().addTab(workspaceId);
						// Update the pane to be a file-viewer (must use set() to get fresh state after addTab)
						const fileViewerPane = createFileViewerPane(tabId, options);
						set((s) => ({
							panes: {
								...s.panes,
								[paneId]: {
									...fileViewerPane,
									id: paneId, // Keep the original ID
								},
							},
						}));
						return paneId;
					}

					const tabPaneIds = extractPaneIdsFromLayout(activeTab.layout);
					const reuseExisting = options.reuseExisting ?? "workspace";
					const existingFileViewerPane =
						reuseExisting !== "none"
							? findReusableFileViewerPane({
									workspaceId,
									activeTabId: activeTab.id,
									tabs: state.tabs,
									panes: state.panes,
									tabHistoryStacks: state.tabHistoryStacks,
									reuseExisting,
									options,
								})
							: null;

					if (existingFileViewerPane) {
						const nextPane = applyFileViewerOpenOptionsToPane(
							existingFileViewerPane,
							options,
						);
						const nextPanes =
							nextPane === existingFileViewerPane
								? state.panes
								: {
										...state.panes,
										[existingFileViewerPane.id]: nextPane,
									};
						const activationState = activatePaneInWorkspace({
							workspaceId,
							paneId: existingFileViewerPane.id,
							tabs: state.tabs,
							panes: nextPanes,
							activeTabIds: state.activeTabIds,
							focusedPaneIds: state.focusedPaneIds,
							tabHistoryStacks: state.tabHistoryStacks,
						});

						if (!activationState) {
							return existingFileViewerPane.id;
						}

						const didPaneNameChange =
							nextPane.name !== existingFileViewerPane.name;
						set({
							...activationState,
							...(didPaneNameChange
								? {
										tabs: state.tabs.map((tab) =>
											tab.id === existingFileViewerPane.tabId
												? {
														...tab,
														name: deriveTabName(nextPanes, tab.id),
													}
												: tab,
										),
									}
								: {}),
						});
						return existingFileViewerPane.id;
					}

					// Look for an existing unpinned (preview) file-viewer pane in the active tab
					const fileViewerPanes = tabPaneIds
						.map((id) => state.panes[id])
						.filter(
							(p) =>
								p?.type === "file-viewer" &&
								p.fileViewer &&
								!p.fileViewer.isPinned,
						);

					// If we found an unpinned (preview) file-viewer pane, reuse it
					// (skip reuse when explicitly requesting a new tab, e.g. cmd+click)
					if (
						fileViewerPanes.length > 0 &&
						!options.openInNewTab &&
						reuseExisting !== "none"
					) {
						const paneToReuse = fileViewerPanes[0];
						const existingFileViewer = paneToReuse.fileViewer;
						if (!existingFileViewer) {
							// Should not happen due to filter above, but satisfy type checker
							return "";
						}
						const paneSession =
							useEditorSessionsStore.getState().sessions[paneToReuse.id];
						const paneDocument = paneSession
							? useEditorDocumentsStore.getState().documents[
									paneSession.documentKey
								]
							: null;
						const isSameFile =
							pathsMatch(existingFileViewer.filePath, options.filePath) &&
							existingFileViewer.diffCategory === options.diffCategory &&
							existingFileViewer.commitHash === options.commitHash;

						if (paneDocument?.dirty && !isSameFile) {
							set({
								focusedPaneIds: {
									...state.focusedPaneIds,
									[activeTab.id]: paneToReuse.id,
								},
							});
							useEditorSessionsStore.getState().setPendingIntent(
								paneToReuse.id,
								{
									type: "replace-preview",
									workspaceId,
									options,
								},
								"unsaved",
							);
							return paneToReuse.id;
						}

						// If clicking the same file that's already in preview, just focus it
						if (isSameFile) {
							const nextViewMode =
								options.viewMode ?? existingFileViewer.viewMode;
							const shouldUpdateViewerState =
								nextViewMode !== existingFileViewer.viewMode ||
								options.line !== undefined ||
								options.column !== undefined;

							if (shouldUpdateViewerState) {
								set({
									panes: {
										...state.panes,
										[paneToReuse.id]: {
											...paneToReuse,
											fileViewer: {
												...existingFileViewer,
												viewMode: nextViewMode,
												initialLine:
													options.line ?? existingFileViewer.initialLine,
												initialColumn:
													options.column ?? existingFileViewer.initialColumn,
											},
										},
									},
									focusedPaneIds: {
										...state.focusedPaneIds,
										[activeTab.id]: paneToReuse.id,
									},
								});
								return paneToReuse.id;
							}
							set({
								focusedPaneIds: {
									...state.focusedPaneIds,
									[activeTab.id]: paneToReuse.id,
								},
							});
							return paneToReuse.id;
						}

						// Different file - replace the preview pane content
						const fileName =
							options.displayName || getPathBaseName(options.filePath);

						const viewMode = resolveFileViewerMode({
							filePath: options.filePath,
							diffCategory: options.diffCategory,
							viewMode: options.viewMode,
							fileStatus: options.fileStatus,
						});

						set({
							panes: {
								...state.panes,
								[paneToReuse.id]: {
									...paneToReuse,
									name: fileName,
									fileViewer: {
										filePath: options.filePath,
										viewMode,
										isPinned: options.isPinned ?? false,
										diffLayout: "inline",
										diffCategory: options.diffCategory,
										commitHash: options.commitHash,
										oldPath: options.oldPath,
										initialLine: options.line,
										initialColumn: options.column,
										displayName: options.displayName,
									},
								},
							},
							focusedPaneIds: {
								...state.focusedPaneIds,
								[activeTab.id]: paneToReuse.id,
							},
						});

						return paneToReuse.id;
					}

					// No reusable pane found, create a new one
					if (options.openInNewTab) {
						const workspaceId = activeTab.workspaceId;
						const newTabId = generateId("tab");
						const newPane = createFileViewerPane(newTabId, {
							...options,
							isPinned: true,
						});

						const newTab = {
							id: newTabId,
							workspaceId,
							name: newPane.name,
							layout: newPane.id as MosaicNode<string>,
							createdAt: Date.now(),
						};

						const currentActiveId = state.activeTabIds[workspaceId];
						const historyStack = state.tabHistoryStacks[workspaceId] || [];
						const newHistoryStack = currentActiveId
							? [
									currentActiveId,
									...historyStack.filter((id) => id !== currentActiveId),
								]
							: historyStack;

						set({
							tabs: [...state.tabs, newTab],
							panes: { ...state.panes, [newPane.id]: newPane },
							activeTabIds: {
								...state.activeTabIds,
								[workspaceId]: newTab.id,
							},
							focusedPaneIds: {
								...state.focusedPaneIds,
								[newTab.id]: newPane.id,
							},
							tabHistoryStacks: {
								...state.tabHistoryStacks,
								[workspaceId]: newHistoryStack,
							},
						});

						posthog.capture("panel_opened", {
							panel_type: "file_viewer",
							workspace_id: workspaceId,
							pane_id: newPane.id,
						});

						return newPane.id;
					}

					const newPane = createFileViewerPane(activeTab.id, options);

					const newLayout: MosaicNode<string> = {
						direction: "row",
						first: activeTab.layout,
						second: newPane.id,
						splitPercentage: 50,
					};

					const newPanes = { ...state.panes, [newPane.id]: newPane };
					const tabName = deriveTabName(newPanes, activeTab.id);

					set({
						tabs: state.tabs.map((t) =>
							t.id === activeTab.id
								? { ...t, layout: newLayout, name: tabName }
								: t,
						),
						panes: newPanes,
						focusedPaneIds: {
							...state.focusedPaneIds,
							[activeTab.id]: newPane.id,
						},
					});

					posthog.capture("panel_opened", {
						panel_type: "file_viewer",
						workspace_id: activeTab.workspaceId,
						pane_id: newPane.id,
					});

					return newPane.id;
				},

				removePane: (paneId) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane) return;

					const tab = state.tabs.find((t) => t.id === pane.tabId);
					if (!tab) return;

					// Devtools panes removed
					const paneIdsToRemove = [paneId];

					// If removing all these panes leaves the tab empty, remove the tab
					const remainingPanes = Object.entries(state.panes).filter(
						([id, p]) => p.tabId === tab.id && !paneIdsToRemove.includes(id),
					);
					if (remainingPanes.length === 0) {
						get().removeTab(tab.id);
						return;
					}

					// Must get adjacent pane BEFORE removing from layout
					const adjacentPaneId = getAdjacentPaneId(tab.layout, paneId);

					// Kill terminal sessions for terminal panes
					for (const id of paneIdsToRemove) {
						if (state.panes[id]?.type === "terminal") {
							killTerminalForPane(id);
						}

						cleanupEditorPaneState(id);
					}

					// Remove all panes from layout
					let newLayout = tab.layout;
					for (const id of paneIdsToRemove) {
						const result = removePaneFromLayout(newLayout, id);
						if (!result) {
							get().removeTab(tab.id);
							return;
						}
						newLayout = result;
					}

					const newPanes = { ...state.panes };
					for (const id of paneIdsToRemove) {
						delete newPanes[id];
					}

					let newFocusedPaneIds = state.focusedPaneIds;
					if (paneIdsToRemove.includes(state.focusedPaneIds[tab.id])) {
						newFocusedPaneIds = {
							...state.focusedPaneIds,
							[tab.id]: adjacentPaneId ?? getFirstPaneId(newLayout),
						};
					}

					const tabName = deriveTabName(newPanes, tab.id);

					set({
						tabs: state.tabs.map((t) =>
							t.id === tab.id ? { ...t, layout: newLayout, name: tabName } : t,
						),
						panes: newPanes,
						focusedPaneIds: newFocusedPaneIds,
					});
				},

				setFocusedPane: (tabId, paneId) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane || pane.tabId !== tabId) return;

					const alreadyFocused = state.focusedPaneIds[tabId] === paneId;

					set({
						panes: {
							...state.panes,
							[paneId]: {
								...pane,
								status: alreadyFocused
									? pane.status
									: acknowledgedStatus(pane.status),
							},
						},
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tabId]: paneId,
						},
					});
				},

				markPaneAsUsed: (paneId) => {
					set((state) => {
						const pane = state.panes[paneId];
						if (!pane || pane.isNew === false) return state;
						return {
							panes: {
								...state.panes,
								[paneId]: { ...pane, isNew: false },
							},
						};
					});
				},

				setPaneStatus: (paneId, status) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane || pane.status === status) return;

					set({
						panes: {
							...state.panes,
							[paneId]: { ...pane, status },
						},
					});
				},

				setPaneName: (paneId, name) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane || pane.name === name) return;

					const newPanes = {
						...state.panes,
						[paneId]: { ...pane, name, userTitle: name },
					};
					const tabName = deriveTabName(newPanes, pane.tabId);

					set({
						panes: newPanes,
						tabs: state.tabs.map((t) =>
							t.id === pane.tabId ? { ...t, name: tabName } : t,
						),
					});
				},
				setPaneWorkspaceRun: (paneId, workspaceRun) => {
					set((state) => {
						const pane = state.panes[paneId];
						if (!pane) return state;
						const nextWorkspaceRun = workspaceRun
							? {
									...pane.workspaceRun,
									...workspaceRun,
								}
							: undefined;
						return {
							panes: {
								...state.panes,
								[paneId]: {
									...pane,
									workspaceRun: nextWorkspaceRun,
								},
							},
						};
					});
				},
				setPaneLifecycleScript: (paneId, lifecycleScript) => {
					set((state) => {
						const pane = state.panes[paneId];
						if (!pane) return state;
						return {
							panes: {
								...state.panes,
								[paneId]: { ...pane, lifecycleScript },
							},
						};
					});
				},
				setPaneAutoTitle: (paneId, title) => {
					set((state) => {
						const pane = state.panes[paneId];
						if (!pane || pane.name === title || pane.userTitle?.trim()) {
							return state;
						}
						return {
							panes: {
								...state.panes,
								[paneId]: { ...pane, name: title },
							},
						};
					});
				},

				clearWorkspaceAttentionStatus: (workspaceId) => {
					const state = get();
					const workspaceTabs = state.tabs.filter(
						(t) => t.workspaceId === workspaceId,
					);
					const workspacePaneIds = workspaceTabs.flatMap((t) =>
						extractPaneIdsFromLayout(t.layout),
					);

					if (workspacePaneIds.length === 0) {
						return;
					}

					const newPanes = { ...state.panes };
					let hasChanges = false;
					for (const paneId of workspacePaneIds) {
						const resolved = acknowledgedStatus(newPanes[paneId]?.status);
						if (resolved !== (newPanes[paneId]?.status ?? "idle")) {
							newPanes[paneId] = { ...newPanes[paneId], status: resolved };
							hasChanges = true;
						}
					}

					if (hasChanges) {
						set({ panes: newPanes });
					}
				},

				resetWorkspaceStatus: (workspaceId) => {
					const state = get();
					const workspaceTabs = state.tabs.filter(
						(t) => t.workspaceId === workspaceId,
					);
					const workspacePaneIds = workspaceTabs.flatMap((t) =>
						extractPaneIdsFromLayout(t.layout),
					);

					if (workspacePaneIds.length === 0) {
						return;
					}

					const newPanes = { ...state.panes };
					let hasChanges = false;
					for (const paneId of workspacePaneIds) {
						if (
							newPanes[paneId]?.status &&
							newPanes[paneId].status !== "idle"
						) {
							newPanes[paneId] = { ...newPanes[paneId], status: "idle" };
							hasChanges = true;
						}
					}

					if (hasChanges) {
						set({ panes: newPanes });
					}
				},

				updatePaneCwd: (paneId, cwd, confirmed) => {
					set((state) => {
						const pane = state.panes[paneId];
						if (!pane) return state;
						if (pane.cwd === cwd && pane.cwdConfirmed === confirmed) {
							return state;
						}
						return {
							panes: {
								...state.panes,
								[paneId]: {
									...pane,
									cwd,
									cwdConfirmed: confirmed,
								},
							},
						};
					});
				},

				retargetFileViewerPaths: (
					workspaceId,
					oldAbsolutePath,
					newAbsolutePath,
					isDirectory,
				) => {
					set((state) => {
						const workspaceTabIds = new Set(
							state.tabs
								.filter((tab) => tab.workspaceId === workspaceId)
								.map((tab) => tab.id),
						);
						if (workspaceTabIds.size === 0) {
							return state;
						}

						let hasChanges = false;
						const nextPanes = { ...state.panes };
						const touchedTabIds = new Set<string>();

						for (const [paneId, pane] of Object.entries(state.panes)) {
							if (
								pane.type !== "file-viewer" ||
								!pane.fileViewer ||
								!workspaceTabIds.has(pane.tabId)
							) {
								continue;
							}

							const nextFilePath = retargetAbsolutePath(
								pane.fileViewer.filePath,
								oldAbsolutePath,
								newAbsolutePath,
								isDirectory,
							);
							if (!nextFilePath) {
								continue;
							}

							hasChanges = true;
							touchedTabIds.add(pane.tabId);
							nextPanes[paneId] = {
								...pane,
								name:
									pane.fileViewer.displayName ?? getPathBaseName(nextFilePath),
								fileViewer: {
									...pane.fileViewer,
									filePath: nextFilePath,
								},
							};
						}

						if (!hasChanges) {
							return state;
						}

						const nextTabs = state.tabs.map((tab) => {
							if (tab.userTitle?.trim() || !touchedTabIds.has(tab.id)) {
								return tab;
							}

							return {
								...tab,
								name: deriveTabName(nextPanes, tab.id),
							};
						});

						return {
							panes: nextPanes,
							tabs: nextTabs,
						};
					});
				},

				clearPaneInitialData: (paneId) => {
					set((state) => {
						const pane = state.panes[paneId];
						if (!pane) return state;
						if (pane.initialCwd === undefined) {
							return state;
						}
						return {
							panes: {
								...state.panes,
								[paneId]: {
									...pane,
									initialCwd: undefined,
								},
							},
						};
					});
				},

				pinPane: (paneId) => {
					set((state) => {
						const pane = state.panes[paneId];
						if (!pane?.fileViewer) return state;
						if (pane.fileViewer.isPinned) return state;
						return {
							panes: {
								...state.panes,
								[paneId]: {
									...pane,
									fileViewer: {
										...pane.fileViewer,
										isPinned: true,
									},
								},
							},
						};
					});
				},

				// Split operations
				splitPaneVertical: (tabId, sourcePaneId, path, options) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab) return;

					const sourcePane = state.panes[sourcePaneId];
					if (!sourcePane || sourcePane.tabId !== tabId) return;

					// Browser panes removed - always create terminal
					const newPane = createPane(tabId, "terminal", options);
					const panelType = "terminal";

					let newLayout: MosaicNode<string>;
					if (path && path.length > 0) {
						// Split at a specific path in the layout
						newLayout = updateTree(tab.layout, [
							{
								path,
								spec: {
									$set: {
										direction: "row",
										first: sourcePaneId,
										second: newPane.id,
										splitPercentage: 50,
									},
								},
							},
						]);
					} else {
						// Split the pane directly
						newLayout = {
							direction: "row",
							first: tab.layout,
							second: newPane.id,
							splitPercentage: 50,
						};
					}

					const newPanes = { ...state.panes, [newPane.id]: newPane };
					const tabName = deriveTabName(newPanes, tabId);

					set({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, layout: newLayout, name: tabName } : t,
						),
						panes: newPanes,
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tabId]: newPane.id,
						},
					});

					posthog.capture("panel_opened", {
						panel_type: panelType,
						workspace_id: tab.workspaceId,
						pane_id: newPane.id,
					});
				},

				splitPaneHorizontal: (tabId, sourcePaneId, path, options) => {
					const state = get();
					const tab = state.tabs.find((t) => t.id === tabId);
					if (!tab) return;

					const sourcePane = state.panes[sourcePaneId];
					if (!sourcePane || sourcePane.tabId !== tabId) return;

					// Browser panes removed - always create terminal
					const newPane = createPane(tabId, "terminal", options);
					const panelType = "terminal";

					let newLayout: MosaicNode<string>;
					if (path && path.length > 0) {
						// Split at a specific path in the layout
						newLayout = updateTree(tab.layout, [
							{
								path,
								spec: {
									$set: {
										direction: "column",
										first: sourcePaneId,
										second: newPane.id,
										splitPercentage: 50,
									},
								},
							},
						]);
					} else {
						// Split the pane directly
						newLayout = {
							direction: "column",
							first: tab.layout,
							second: newPane.id,
							splitPercentage: 50,
						};
					}

					const newPanes = { ...state.panes, [newPane.id]: newPane };
					const tabName = deriveTabName(newPanes, tabId);

					set({
						tabs: state.tabs.map((t) =>
							t.id === tabId ? { ...t, layout: newLayout, name: tabName } : t,
						),
						panes: newPanes,
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tabId]: newPane.id,
						},
					});

					posthog.capture("panel_opened", {
						panel_type: panelType,
						workspace_id: tab.workspaceId,
						pane_id: newPane.id,
					});
				},

				splitPaneAuto: (tabId, sourcePaneId, dimensions, path, options) => {
					if (dimensions.width >= dimensions.height) {
						get().splitPaneVertical(tabId, sourcePaneId, path, options);
					} else {
						get().splitPaneHorizontal(tabId, sourcePaneId, path, options);
					}
				},

				movePaneToTab: (paneId, targetTabId) => {
					const state = get();
					const pane = state.panes[paneId];
					const result = movePaneToTab(state, paneId, targetTabId);
					if (!result) return;

					set(withDerivedTabNames(result, [pane?.tabId, targetTabId]));
				},

				movePaneToNewTab: (paneId) => {
					const state = get();
					const pane = state.panes[paneId];
					if (!pane) return "";

					const sourceTab = state.tabs.find((t) => t.id === pane.tabId);
					if (!sourceTab) return "";

					// Already in its own tab
					if (isLastPaneInTab(state.panes, sourceTab.id)) return sourceTab.id;

					const moveResult = movePaneToNewTab(state, paneId);
					if (!moveResult) return "";

					set(
						withDerivedTabNames(moveResult.result, [
							sourceTab.id,
							moveResult.newTabId,
						]),
					);
					return moveResult.newTabId;
				},

				mergeTabIntoTab: (
					sourceTabId,
					targetTabId,
					destinationPath,
					position,
				) => {
					const state = get();
					const result = mergeTabIntoTab(
						state,
						sourceTabId,
						targetTabId,
						destinationPath,
						position,
					);
					if (!result) return;

					set(withDerivedTabNames(result, [targetTabId]));
				},

				// Comment operations
				openCommentPane: (workspaceId: string, comment: CommentPaneData) => {
					// Route into the panes store when `V2_PANES_IN_V1` owns the view:
					// the panes engine renders from its per-workspace store, so the
					// ReviewPanel open must seed `data.comment` there. The v1 store
					// write below still runs (kept as the non-panes fallback and to
					// preserve the v1 pane for the M7 cleanup); when no panes store is
					// registered (flag off, or the workspace view is not mounted)
					// the v1-only path is unchanged.
					const panesStore = getV1PanesStore(workspaceId);
					if (panesStore) {
						openCommentInPanesStore(panesStore, comment);
					}

					const state = get();

					// Reuse an existing comment pane in this workspace if one exists
					const workspaceTabIds = new Set(
						state.tabs
							.filter((t) => t.workspaceId === workspaceId)
							.map((t) => t.id),
					);
					const existingPane = Object.values(state.panes).find(
						(p) => p.type === "comment" && workspaceTabIds.has(p.tabId),
					);

					if (existingPane) {
						const newPanes = {
							...state.panes,
							[existingPane.id]: {
								...existingPane,
								name: `@${comment.authorLogin}`,
								comment,
							},
						};
						const tabName = deriveTabName(newPanes, existingPane.tabId);
						const nextTabs = state.tabs.map((t) =>
							t.id === existingPane.tabId ? { ...t, name: tabName } : t,
						);
						const activationState = activatePaneInWorkspace({
							workspaceId,
							paneId: existingPane.id,
							tabs: nextTabs,
							panes: newPanes,
							activeTabIds: state.activeTabIds,
							focusedPaneIds: state.focusedPaneIds,
							tabHistoryStacks: state.tabHistoryStacks,
						});

						if (!activationState) {
							set({ panes: newPanes, tabs: nextTabs });
							return { tabId: existingPane.tabId, paneId: existingPane.id };
						}

						set({ ...activationState, tabs: nextTabs });
						return { tabId: existingPane.tabId, paneId: existingPane.id };
					}

					const { tab, pane } = createCommentTabWithPane(workspaceId, comment);

					const currentActiveId = state.activeTabIds[workspaceId];
					const historyStack = state.tabHistoryStacks[workspaceId] || [];
					const newHistoryStack = currentActiveId
						? [
								currentActiveId,
								...historyStack.filter((id) => id !== currentActiveId),
							]
						: historyStack;

					set({
						tabs: [...state.tabs, tab],
						panes: { ...state.panes, [pane.id]: pane },
						activeTabIds: {
							...state.activeTabIds,
							[workspaceId]: tab.id,
						},
						focusedPaneIds: {
							...state.focusedPaneIds,
							[tab.id]: pane.id,
						},
						tabHistoryStacks: {
							...state.tabHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
					});

					posthog.capture("panel_opened", {
						panel_type: "comment",
						workspace_id: workspaceId,
						pane_id: pane.id,
					});

					return { tabId: tab.id, paneId: pane.id };
				},

				// Browser operations removed for single-user setup

				// Reopen operations
				reopenClosedTab: (workspaceId: string): boolean => {
					const state = get();
					// Find the most recently closed tab for this workspace
					const idx = state.closedTabsStack.findIndex(
						(entry) => entry.tab.workspaceId === workspaceId,
					);
					if (idx === -1) return false;

					const entry = state.closedTabsStack[idx];
					const newStack = [
						...state.closedTabsStack.slice(0, idx),
						...state.closedTabsStack.slice(idx + 1),
					];

					// Restore the tab with a new ID to avoid collisions
					const newTabId = generateId("tab");
					const restoredTab = {
						...entry.tab,
						id: newTabId,
					};

					// Restore panes with updated tabId references
					const idMap = new Map<string, string>();
					const restoredPanes: Record<string, (typeof entry.panes)[number]> =
						{};
					for (const pane of entry.panes) {
						const newPaneId = generateId("pane");
						idMap.set(pane.id, newPaneId);
						restoredPanes[newPaneId] = {
							...pane,
							id: newPaneId,
							tabId: newTabId,
							status: "idle",
						};
					}

					// Remap layout leaf IDs
					const remapLayout = (
						node: MosaicNode<string>,
					): MosaicNode<string> => {
						if (typeof node === "string") {
							return idMap.get(node) ?? node;
						}
						return {
							...node,
							first: remapLayout(node.first),
							second: remapLayout(node.second),
						};
					};
					restoredTab.layout = remapLayout(restoredTab.layout);

					const currentActiveId = state.activeTabIds[workspaceId];
					const historyStack = state.tabHistoryStacks[workspaceId] || [];
					const newHistoryStack = currentActiveId
						? [
								currentActiveId,
								...historyStack.filter((id) => id !== currentActiveId),
							]
						: historyStack;

					const firstPaneId = getFirstPaneId(restoredTab.layout);

					set({
						tabs: [...state.tabs, restoredTab],
						panes: { ...state.panes, ...restoredPanes },
						activeTabIds: {
							...state.activeTabIds,
							[workspaceId]: newTabId,
						},
						focusedPaneIds: {
							...state.focusedPaneIds,
							[newTabId]: firstPaneId,
						},
						closedTabsStack: newStack,
						tabHistoryStacks: {
							...state.tabHistoryStacks,
							[workspaceId]: newHistoryStack,
						},
					});

					return true;
				},

				// Query helpers
				getTabsByWorkspace: (workspaceId) => {
					return get().tabs.filter((t) => t.workspaceId === workspaceId);
				},

				getActiveTab: (workspaceId) => {
					const state = get();
					const activeTabId = resolveActiveTabIdForWorkspace({
						workspaceId,
						tabs: state.tabs,
						activeTabIds: state.activeTabIds,
						tabHistoryStacks: state.tabHistoryStacks,
					});
					if (!activeTabId) return null;
					return state.tabs.find((t) => t.id === activeTabId) || null;
				},

				getPanesForTab: (tabId) => {
					const state = get();
					return Object.values(state.panes).filter((p) => p.tabId === tabId);
				},

				getFocusedPane: (tabId) => {
					const state = get();
					const focusedPaneId = state.focusedPaneIds[tabId];
					if (!focusedPaneId) return null;
					return state.panes[focusedPaneId] || null;
				},
			}),
			{
				name: "tabs-storage",
				version: 10,
				storage: trpcTabsStorage,
				migrate: (persistedState, version) => {
					const state = persistedState as TabsState;
					if (version < 2 && state.panes) {
						// Migrate needsAttention → status
						for (const pane of Object.values(state.panes)) {
							// biome-ignore lint/suspicious/noExplicitAny: migration from old schema
							const legacyPane = pane as any;
							if (legacyPane.needsAttention === true) {
								pane.status = "review";
							}
							delete legacyPane.needsAttention;
						}
					}
					if (version < 3 && state.panes) {
						// Migrate isLocked → isPinned
						for (const pane of Object.values(state.panes)) {
							if (pane.fileViewer) {
								// biome-ignore lint/suspicious/noExplicitAny: migration from old schema
								const legacyFileViewer = pane.fileViewer as any;
								// Default old panes to pinned (they were explicitly opened)
								pane.fileViewer.isPinned = legacyFileViewer.isLocked ?? true;
								delete legacyFileViewer.isLocked;
							}
						}
					}
					if (version < 5 && state.panes) {
						for (const pane of Object.values(state.panes)) {
							// biome-ignore lint/suspicious/noExplicitAny: migration from legacy chat pane shape
							const legacyPane = pane as any;
							if (legacyPane.chat) {
								legacyPane.chat.sessionId = null;
							}
							if (legacyPane.chatMastra) {
								legacyPane.chatMastra.sessionId = null;
							}
						}
					}
					if (version < 9 && state.panes) {
						for (const pane of Object.values(state.panes)) {
							normalizePersistedChatPane(pane);
						}
					}
					if (version < 10) {
						stripChatPanes(state);
					}
					return state;
				},
				merge: (persistedState, currentState) => {
					const persisted = persistedState as TabsState;
					// Clear stale transient statuses on startup:
					// - "working": Agent can't be working if app just restarted
					// - "permission": Permission dialog is gone after restart
					// Note: "review" is intentionally preserved so users see missed completions
					if (persisted.panes) {
						for (const pane of Object.values(persisted.panes)) {
							if (pane.status === "working" || pane.status === "permission") {
								pane.status = "idle";
							}
							// Workspace-run "running" state can't survive a restart —
							// the daemon session is gone. Mark as exited so the sidebar
							// indicator is correct even if the pane never remounts.
							if (pane.workspaceRun?.state === "running") {
								pane.workspaceRun = {
									...pane.workspaceRun,
									state: "stopped-by-exit",
								};
							}
						}
					}

					const mergedState = { ...currentState, ...persisted };

					// Sanitize persisted tab pointers to be workspace-scoped.
					// This prevents cross-workspace rendering when state is stale/corrupt.
					const tabIds = new Set(mergedState.tabs.map((t) => t.id));
					const workspaceTabIdSets = new Map<string, Set<string>>();
					for (const tab of mergedState.tabs) {
						let setForWorkspace = workspaceTabIdSets.get(tab.workspaceId);
						if (!setForWorkspace) {
							setForWorkspace = new Set();
							workspaceTabIdSets.set(tab.workspaceId, setForWorkspace);
						}
						setForWorkspace.add(tab.id);
					}

					const workspaceIds = new Set<string>([
						...Object.keys(mergedState.activeTabIds),
						...Object.keys(mergedState.tabHistoryStacks),
					]);
					for (const tab of mergedState.tabs) {
						workspaceIds.add(tab.workspaceId);
					}

					const nextActiveTabIds = { ...mergedState.activeTabIds };
					const nextHistoryStacks = { ...mergedState.tabHistoryStacks };

					for (const workspaceId of workspaceIds) {
						nextActiveTabIds[workspaceId] = resolveActiveTabIdForWorkspace({
							workspaceId,
							tabs: mergedState.tabs,
							activeTabIds: mergedState.activeTabIds,
							tabHistoryStacks: mergedState.tabHistoryStacks,
						});

						const workspaceTabIds = workspaceTabIdSets.get(workspaceId);
						const history = nextHistoryStacks[workspaceId] ?? [];
						if (workspaceTabIds && Array.isArray(history)) {
							nextHistoryStacks[workspaceId] = history.filter((id) =>
								workspaceTabIds.has(id),
							);
						}
					}

					const nextFocusedPaneIds = { ...mergedState.focusedPaneIds };
					for (const [tabId, paneId] of Object.entries(nextFocusedPaneIds)) {
						if (!tabIds.has(tabId)) {
							delete nextFocusedPaneIds[tabId];
							continue;
						}
						const pane = mergedState.panes[paneId];
						if (!pane || pane.tabId !== tabId) {
							delete nextFocusedPaneIds[tabId];
						}
					}

					return {
						...mergedState,
						activeTabIds: nextActiveTabIds,
						tabHistoryStacks: nextHistoryStacks,
						focusedPaneIds: nextFocusedPaneIds,
					};
				},
			},
		),
		{ name: "TabsStore" },
	),
);
