import type {
	ContextMenuActionConfig,
	PaneDefinition,
	PaneRegistry,
	RendererContext,
} from "@superset/panes";
import { FileText, Globe, MessageSquare, TerminalSquare } from "lucide-react";
import { useCallback, useMemo } from "react";
import {
	LuArrowDownToLine,
	LuClipboard,
	LuClipboardCopy,
	LuEraser,
	LuPower,
} from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useTranslation } from "renderer/providers/I18nProvider";
import { HostServiceTerminalPane } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/HostServiceTerminalPane";
import { useHostServiceTerminal } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useHostServiceTerminal";
import { useChangesStore } from "renderer/stores/changes";
import { buildEditorDocumentKey } from "renderer/stores/editor-state/types";
import { useEditorDocumentsStore } from "renderer/stores/editor-state/useEditorDocumentsStore";
import { killTerminalForPane } from "renderer/stores/tabs/utils/terminal-cleanup";
import { isImageFile, isMarkdownFile } from "shared/file-types";
import { buildV1PanesLifecycleRegistry } from "./buildV1PanesLifecycleRegistry";
import {
	commentPaneTitle,
	devtoolsPaneTitle,
	type NonTerminalPaneTitles,
	webviewPaneTitle,
} from "./buildV1PanesNonTerminalRegistry";
import { buildV1TerminalContextMenu } from "./buildV1TerminalContextMenu";
import { createV1PanesTerminalPaneBridge } from "./createV1PanesTerminalPaneBridge";
import type { V1PanesPaneData } from "./types";
import {
	useV1DefaultContextMenuActions,
	useV1DefaultPaneActions,
} from "./useV1DefaultActions";
import { useV1PanesPresetOpeners } from "./useV1PanesPresetOpeners";
import { useV1PanesWorkspacePaneLayout } from "./useV1PanesWorkspacePaneLayout";
import { useV1TerminalLauncher } from "./useV1TerminalLauncher";
import { V1PanesBrowserContent } from "./V1PanesBrowserContent";
import { V1PanesCommentContent } from "./V1PanesCommentContent";
import { V1PanesDevToolsContent } from "./V1PanesDevToolsContent";
import { V1PanesFileViewerContent } from "./V1PanesFileViewerContent";
import { FileViewerPaneHeaderExtras } from "./FileViewerPaneHeaderExtras";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { requestViewModeChange } from "renderer/stores/editor-state/editorCoordinator";

export function createBrowserState(
	url = "about:blank",
): NonNullable<V1PanesPaneData["browser"]> {
	return {
		currentUrl: url,
		history: [{ url, title: "", timestamp: Date.now() }],
		historyIndex: 0,
		isLoading: false,
	};
}

const MOD_KEY = navigator.platform.toLowerCase().includes("mac")
	? "⌘"
	: "Ctrl+";

function terminalStatusClass(status: V1PanesPaneData["status"]): string {
	switch (status) {
		case "working":
			return "text-amber-500";
		case "review":
			return "text-emerald-500";
		case "permission":
		case "failed":
			return "text-red-500";
		default:
			return "";
	}
}

/**
 * v1-panes-in-v1 pane registry. Terminal-only.
 *
 * The lifecycle slice (getTitle/titleSource/onBeforeClose/onAfterClose)
 * comes from `buildV1PanesLifecycleRegistry`, which takes
 * `terminalRuntimeRegistry`, `killTerminalForPane`, the close-confirm
 * probe, and labels as injected deps so it can load in tests. The context
 * menu slice comes from `buildV1TerminalContextMenu`, similarly injected.
 * `renderPane`/`getIcon`/`renderHeaderExtras` are layered on here because
 * they render Electron-only / react-icons components.
 *
 * `probeRunning` and `killSession` route to the host-service terminal
 * client (the same adapter `HostServiceTerminalPane` obtains via
 * `useHostServiceTerminal`). The probe keys by `pane.data.terminalId`
 * (backend session id) — the running check is a backend question.
 * `onAfterClose` still kills by `pane.id` (UI identity) via
 * `killTerminalForPane`.
 *
 * v2-only bits intentionally dropped: the notification indicator
 * (`V2NotificationStatusIndicator`), the session dropdown
 * (`TerminalSessionDropdown`, depends on the v2 launcher/provider), and
 * the v2 tRPC killSession mutation (replaced by the host-service client
 * here). `renderPane` follows v1's terminal backend selection: it uses the
 * neutral `HostServiceTerminalPane` when its flag is on and the legacy
 * `Terminal` otherwise. `renderHeaderExtras` is deferred (the v2 header
 * extras host a connection indicator that depends on the v2
 * workspace-client daemon health query); M2 keeps the rich-input entry out
 * of scope until a host-agnostic connection indicator exists.
 */
function useV1PanesRegistry(
	workspaceId: string,
): PaneRegistry<V1PanesPaneData> {
	const { t } = useTranslation();
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);
	const { hostUrl, hostWorkspaceId } = useHostServiceTerminal({
		workspaceId,
		worktreePath: workspace?.worktreePath,
	});
	const clearShortcut = useHotkeyDisplay("CLEAR_TERMINAL").text;
	const scrollToBottomShortcut = useHotkeyDisplay("SCROLL_TO_BOTTOM").text;

	const probeRunning = useCallback(
		async (terminalId: string): Promise<boolean> => {
			if (!hostUrl || !hostWorkspaceId) return false;
			try {
				const { running } = await getHostServiceClientByUrl(
					hostUrl,
				).terminal.hasRunningProcess.query({
					terminalId,
					workspaceId: hostWorkspaceId,
				});
				return running;
			} catch {
				// Fail open: a probe that errors must not block the close.
				return false;
			}
		},
		[hostUrl, hostWorkspaceId],
	);

	const killSession = useCallback(
		(terminalId: string) => {
			if (!hostUrl || !hostWorkspaceId) return;
			getHostServiceClientByUrl(hostUrl)
				.terminal.killSession.mutate({
					terminalId,
					workspaceId: hostWorkspaceId,
				})
				.then(() => {
					// silent: the user explicitly asked to kill the session.
				})
				.catch((error: unknown) => {
					console.warn("Failed to kill terminal session", {
						terminalId,
						workspaceId: hostWorkspaceId,
						error,
					});
				});
		},
		[hostUrl, hostWorkspaceId],
	);

	return useMemo<PaneRegistry<V1PanesPaneData>>(() => {
		const nonTerminalLabels: NonTerminalPaneTitles = {
			devtools: t("v2Workspace.paneRegistry.titleDevTools"),
			browser: t("v2Workspace.paneRegistry.titleBrowser"),
		};
		const lifecycle = buildV1PanesLifecycleRegistry({
			terminalRuntime: terminalRuntimeRegistry,
			killTerminal: killTerminalForPane,
			probeRunning,
			closeConfirmLabels: {
				title: t("v2Workspace.paneRegistry.confirmCloseTitle"),
				description: t("v2Workspace.paneRegistry.confirmCloseDesc"),
				confirmLabel: t("v2Workspace.paneRegistry.confirmCloseLabel"),
			},
		});
		// Build the terminal clipboard/kill slice and merge it with the
		// panes engine's default actions (split/equalize/move/close) the
		// <Workspace> `contextMenuActions` prop injects as `defaults`. The
		// close-pane default is re-labeled with the terminal close label.
		const buildContextMenu = (
			defaults: ContextMenuActionConfig<V1PanesPaneData>[],
		) =>
			buildV1TerminalContextMenu(
				{
					terminalRuntime: terminalRuntimeRegistry,
					killSession,
					labels: {
						copy: t("common.copy"),
						paste: t("v2Workspace.paneRegistry.paste"),
						clearTerminal: t("v2Workspace.paneRegistry.clearTerminal"),
						scrollToBottom: t("v2Workspace.paneRegistry.scrollToBottom"),
						killTerminalSession: t(
							"v2Workspace.paneRegistry.killTerminalSession",
						),
						closeTerminal: t("v2Workspace.paneRegistry.closeTerminal"),
					},
					hotkeys: {
						clear: clearShortcut !== "Unassigned" ? clearShortcut : undefined,
						scrollToBottom:
							scrollToBottomShortcut !== "Unassigned"
								? scrollToBottomShortcut
								: undefined,
					},
					icons: {
						copy: <LuClipboardCopy />,
						paste: <LuClipboard />,
						clear: <LuEraser />,
						scrollToBottom: <LuArrowDownToLine />,
						kill: <LuPower />,
					},
					copyPasteShortcutPrefix: MOD_KEY,
				},
				defaults,
			);
		const terminal: PaneDefinition<V1PanesPaneData> = {
			...lifecycle,
			getIcon: (ctx) => (
				<TerminalSquare
					className={`size-3.5 ${terminalStatusClass(ctx.pane.data.status)}`}
				/>
			),
			renderHeaderExtras: (ctx) =>
				ctx.pane.data.status && ctx.pane.data.status !== "idle" ? (
					<span
						className="text-[10px] text-muted-foreground"
						title={`Terminal status: ${ctx.pane.data.status}`}
					>
						{ctx.pane.data.status}
					</span>
				) : null,
			renderPane: (ctx: RendererContext<V1PanesPaneData>) => (
				<HostServiceTerminalPane
					paneId={ctx.pane.id}
					tabId={ctx.tab.id}
					workspaceId={workspaceId}
					terminalId={ctx.pane.data.terminalId}
					initialCommand={ctx.pane.data.initialCommand}
					initialCwd={ctx.pane.data.initialCwd}
					forceHostService
					paneBridge={createV1PanesTerminalPaneBridge(ctx)}
				/>
			),
			contextMenuActions: (_ctx, defaults) => buildContextMenu(defaults),
		};

		// --- file viewer -------------------------------------------------------
		const fileViewer: PaneDefinition<V1PanesPaneData> = {
			getIcon: () => <FileText className="size-3.5" />,
			getTitle: (pane) =>
				pane.data.fileViewer?.displayName ??
				pane.data.fileViewer?.filePath.split("/").pop(),
			renderTitle: (ctx) => {
				const file = ctx.pane.data.fileViewer;
				if (!file || !workspaceId) return null;

				const documentKey = buildEditorDocumentKey({
					workspaceId,
					filePath: file.filePath,
					diffCategory: file.diffCategory,
					commitHash: file.commitHash,
					oldPath: file.oldPath,
				});
				const isDirty =
					useEditorDocumentsStore.getState().documents[documentKey]?.dirty ??
					false;
				const fileName = file.displayName ?? file.filePath.split("/").pop();
				const { copyToClipboard, copied } = useCopyToClipboard(1500);

				return (
					<Tooltip open={copied ? true : undefined}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={() => copyToClipboard(file.filePath)}
								className={cn(
									"flex min-w-0 items-center gap-2 truncate text-xs transition-colors",
									ctx.isActive
										? "text-foreground hover:text-foreground"
										: "text-muted-foreground hover:text-foreground",
									!file.isPinned && "italic",
								)}
							>
								<FileText className="size-3.5 shrink-0" />
								{isDirty && <span className="text-amber-500">●</span>}
								<span className="truncate">{fileName}</span>
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom" showArrow={false}>
							{copied ? "Copied!" : "Click to copy path"}
						</TooltipContent>
					</Tooltip>
				);
			},
			renderHeaderExtras: (ctx) => {
				const file = ctx.pane.data.fileViewer;
				if (!file) return null;

				const hasRenderedMode =
					isMarkdownFile(file.filePath) || isImageFile(file.filePath);
				const hasDiff = !!file.diffCategory;

				return (
					<FileViewerPaneHeaderExtras
						paneId={ctx.pane.id}
						viewMode={file.viewMode ?? "raw"}
						isPinned={file.isPinned ?? false}
						hasRenderedMode={hasRenderedMode}
						hasDiff={hasDiff}
						onViewModeChange={(value) =>
							void requestViewModeChange(ctx.pane.id, value as any)
						}
					/>
				);
			},
			renderPane: (ctx) => {
				const file = ctx.pane.data.fileViewer;
				if (!file || !workspace?.worktreePath) {
					return (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							File unavailable
						</div>
					);
				}
				return (
					<V1PanesFileViewerContent
						paneId={ctx.pane.id}
						tabId={ctx.tab.id}
						worktreePath={workspace.worktreePath}
						fileViewer={file}
						onFileViewerChange={(nextFileViewer) =>
							ctx.actions.updateData({
								...ctx.pane.data,
								fileViewer: nextFileViewer,
							})
						}
						onClose={ctx.actions.close}
					/>
				);
			},
			contextMenuActions: (_ctx, defaults) =>
				defaults.map((d) =>
					d.key === "close-pane"
						? { ...d, label: t("v2Workspace.paneRegistry.closeFile") }
						: d,
				),
		};

		// --- comment -----------------------------------------------------------
		// Self-contained: the full `CommentPaneState` payload lives in the
		// panes pane `data.comment`, so the renderer reads no v1 store. Title
		// mirrors v1's pane name (`@<authorLogin>`); the avatar header icon
		// reuses the comment avatar when present (matches v2's registry).
		const comment: PaneDefinition<V1PanesPaneData> = {
			getIcon: (ctx) => {
				const c = ctx.pane.data.comment;
				if (c?.avatarUrl) {
					return (
						<img src={c.avatarUrl} alt="" className="size-3.5 rounded-full" />
					);
				}
				return <MessageSquare className="size-3.5" />;
			},
			getTitle: (pane) => commentPaneTitle(pane.data),
			renderPane: (ctx) => {
				const c = ctx.pane.data.comment;
				if (!c) {
					return (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							No comment selected
						</div>
					);
				}
				return <V1PanesCommentContent comment={c} />;
			},
			contextMenuActions: (_ctx, defaults) =>
				defaults.map((d) =>
					d.key === "close-pane"
						? { ...d, label: t("v2Workspace.paneRegistry.closeComment") }
						: d,
				),
		};

		// --- devtools ----------------------------------------------------------
		// Self-contained: `data.devtools.targetPaneId` is the only field. The
		// pane opens the Electron devtools for the inspected browser pane on
		// mount; no v1 store read is needed. Title is static ("DevTools").
		const devtools: PaneDefinition<V1PanesPaneData> = {
			getTitle: () => devtoolsPaneTitle(nonTerminalLabels),
			renderPane: (ctx) => {
				const targetPaneId = ctx.pane.data.devtools?.targetPaneId;
				if (!targetPaneId) {
					return (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							No target pane
						</div>
					);
				}
				return <V1PanesDevToolsContent targetPaneId={targetPaneId} />;
			},
		};

		// --- webview (browser) -------------------------------------------------
		// The browser navigation toolbar (URL bar, back/forward/reload) is
		// pane content, not window chrome, so it stays in the body. The
		// `usePersistentWebview` hook registers a fresh Electron webview
		// session keyed by the panes pane id; the v1 global tabs store is NOT
		// consulted (panes pane id != v1 pane id), so navigation history is
		// scoped to the panes session. Initial url comes from `data.browser`.
		// Live history persistence to the panes store (mirroring v1's
		// `navigateBrowserHistory`) is a fidelity follow-up, like the terminal
		// `renderHeaderExtras` connection indicator was deferred in M2.
		const webview: PaneDefinition<V1PanesPaneData> = {
			getIcon: () => <Globe className="size-3.5" />,
			getTitle: (pane) => webviewPaneTitle(pane.data, nonTerminalLabels),
			renderPane: (ctx) => {
				const browser = ctx.pane.data.browser ?? createBrowserState();
				return (
					<V1PanesBrowserContent
						paneId={ctx.pane.id}
						tabId={ctx.tab.id}
						browser={browser}
						onBrowserChange={(nextBrowser) =>
							ctx.actions.updateData({
								...ctx.pane.data,
								browser: nextBrowser,
							})
						}
						onOpenBrowser={(url) => {
							ctx.store.getState().addTab({
								panes: [
									{
										kind: "webview",
										data: { browser: createBrowserState(url) },
									},
								],
							});
						}}
						onOpenDevTools={() => {
							ctx.store.getState().addTab({
								panes: [
									{
										kind: "devtools",
										data: {
											devtools: { targetPaneId: ctx.pane.id },
										},
									},
								],
							});
						}}
						onClose={ctx.actions.close}
					/>
				);
			},
			contextMenuActions: (_ctx, defaults) =>
				defaults.map((d) =>
					d.key === "close-pane"
						? { ...d, label: t("v2Workspace.paneRegistry.closeBrowser") }
						: d,
				),
		};

		return {
			terminal,
			"file-viewer": fileViewer,
			comment,
			devtools,
			webview,
		};
	}, [
		t,
		probeRunning,
		killSession,
		clearShortcut,
		scrollToBottomShortcut,
		workspaceId,
		workspace?.worktreePath,
	]);
}

/**
 * Store + registry for the v2-panes-in-v1 mount.
 *
 * The store is backed by `useV1PanesWorkspacePaneLayout`, which persists
 * the panes layout to the shared `v2WorkspaceLocalState` TanStack DB
 * collection (per-workspace row) and performs the one-time v1→v2 seed
 * from the v1 global tabs store on first flag-on — layout survives
 * remount and workspace switch, and users keep their open terminal on
 * first flag-on. `addTerminalPane` is exposed for ad-hoc split tests
 * during validation.
 *
 * `paneActions` / `contextMenuActions` are the v1 default split/close/
 * equalize/move actions wired through the v1 terminal launcher; the panes
 * engine injects the context-menu defaults into each pane kind's
 * `contextMenuActions(ctx, defaults)`, where the terminal registry merges
 * them with its clipboard/kill slice.
 */
export function useV1PanesWorkspace(workspaceId: string) {
	const { store } = useV1PanesWorkspacePaneLayout(workspaceId);
	const registry = useV1PanesRegistry(workspaceId);
	const launcher = useV1TerminalLauncher();
	const paneActions = useV1DefaultPaneActions(launcher);
	const contextMenuActions = useV1DefaultContextMenuActions(registry, launcher);
	const openers = useV1PanesPresetOpeners(workspaceId, store);

	const addTerminalPane = useCallback(() => {
		const state = store.getState();
		const activeTab = state.getActiveTab();
		if (!activeTab) return;
		state.addPane({
			tabId: activeTab.id,
			pane: {
				kind: "terminal",
				data: { terminalId: crypto.randomUUID() },
			},
			position: "right",
		});
	}, [store]);

	return {
		store,
		registry,
		launcher,
		addTerminalPane,
		paneActions,
		contextMenuActions,
		openers,
	};
}
