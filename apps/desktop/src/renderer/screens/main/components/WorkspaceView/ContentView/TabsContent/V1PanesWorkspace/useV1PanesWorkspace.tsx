import type {
	ContextMenuActionConfig,
	PaneDefinition,
	PaneRegistry,
	RendererContext,
} from "@superset/panes";
import { BUILTIN_AGENT_LABELS } from "@superset/shared/agent-catalog";
import { Bot, FileText, MessageSquare, TerminalSquare } from "lucide-react";
import { useCallback, useMemo } from "react";
import {
	LuArrowDownToLine,
	LuClipboard,
	LuClipboardCopy,
	LuEraser,
	LuPower,
} from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { createDesktopAcpSessionClient } from "renderer/lib/acp-session-client";
import { launchAcpSession } from "renderer/lib/acp-session-launch";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useCatalogWorkspace } from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider/selectors";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { HostServiceTerminalPane } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/HostServiceTerminalPane";
import { useHostServiceTerminal } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useHostServiceTerminal";
import { requestViewModeChange } from "renderer/stores/editor-state/editorCoordinator";
import { killTerminalForPane } from "renderer/stores/tabs/utils/terminal-cleanup";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import { isHtmlFile, isImageFile, isMarkdownFile } from "shared/file-types";
import type { FileViewerMode } from "shared/tabs-types";
import { AcpSessionPane } from "../AcpSessionPane";
import { clearAcpComposerDraft } from "../AcpSessionPane/components/AcpComposer/acpComposerState";
import { AcpPaneToolbar } from "../AcpSessionPane/components/AcpPaneToolbar";
import {
	buildV1PanesAcpLifecycleRegistry,
	buildV1PanesLifecycleRegistry,
} from "./buildV1PanesLifecycleRegistry";
import { commentPaneTitle } from "./buildV1PanesNonTerminalRegistry";
import { buildV1TerminalContextMenu } from "./buildV1TerminalContextMenu";
import { createV1PanesTerminalPaneBridge } from "./createV1PanesTerminalPaneBridge";
import { FileViewerPaneHeaderExtras } from "./FileViewerPaneHeaderExtras";
import { FileViewerPaneTitle } from "./FileViewerPaneTitle";
import type { V1PanesPaneData } from "./types";
import { useAcpPresetLauncher } from "./useAcpPresetLauncher";
import {
	useV1DefaultContextMenuActions,
	useV1DefaultPaneActions,
} from "./useV1DefaultActions";
import { useV1PanesPresetOpeners } from "./useV1PanesPresetOpeners";
import { useV1PanesWorkspacePaneLayout } from "./useV1PanesWorkspacePaneLayout";
import { useV1TerminalLauncher } from "./useV1TerminalLauncher";
import { V1PanesCommentContent } from "./V1PanesCommentContent";
import { V1PanesFileViewerContent } from "./V1PanesFileViewerContent";

const MOD_KEY = navigator.platform.toLowerCase().includes("mac")
	? "⌘"
	: "Ctrl+";

function terminalStatusClass(status: V1PanesPaneData["status"]): string {
	switch (status) {
		case "working":
			return "text-warning";
		case "review":
			return "text-success";
		case "permission":
		case "failed":
			return "text-destructive";
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
	const { workspace } = useCatalogWorkspace(workspaceId);
	const { hostUrl, hostWorkspaceId } = useHostServiceTerminal({
		workspaceId,
		worktreePath: workspace?.worktreePath,
		forceEnabled: true,
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
		// NonTerminalPaneTitles no longer needed
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
			renderHeaderExtras: (ctx) => {
				const status = ctx.pane.data.status;
				return status && status !== "idle" ? (
					<StatusIndicator status={status} />
				) : null;
			},
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

				return (
					<FileViewerPaneTitle
						workspaceId={workspaceId}
						filePath={file.filePath}
						displayName={file.displayName}
						isPinned={file.isPinned ?? false}
						isActive={ctx.isActive}
						diffCategory={file.diffCategory}
						commitHash={file.commitHash}
						oldPath={file.oldPath}
					/>
				);
			},
			renderHeaderExtras: (ctx) => {
				const file = ctx.pane.data.fileViewer;
				if (!file) return null;

				const hasRenderedMode =
					isMarkdownFile(file.filePath) ||
					isImageFile(file.filePath) ||
					isHtmlFile(file.filePath);
				const hasDiff = !!file.diffCategory;

				return (
					<FileViewerPaneHeaderExtras
						paneId={ctx.pane.id}
						filePath={
							workspace?.worktreePath
								? toAbsoluteWorkspacePath(workspace.worktreePath, file.filePath)
								: null
						}
						viewMode={file.viewMode ?? "raw"}
						isPinned={file.isPinned ?? false}
						hasRenderedMode={hasRenderedMode}
						hasDiff={hasDiff}
						onViewModeChange={(value) =>
							void requestViewModeChange(ctx.pane.id, value as FileViewerMode)
						}
					/>
				);
			},
			renderPane: (ctx) => {
				const file = ctx.pane.data.fileViewer;
				if (!file || !workspace?.worktreePath) {
					return (
						<div className="flex h-full items-center justify-center text-sm text-fg-mute">
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
						<div className="flex h-full items-center justify-center text-sm text-fg-mute">
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

		// devtools and webview removed with internal browser feature

		// --- acp agent pane ----------------------------------------------------
		const acpLifecycle = buildV1PanesAcpLifecycleRegistry({
			closeAcpSession: async (sessionId) => {
				if (!hostUrl) throw new Error("ACP host is unavailable");
				const { createDesktopAcpSessionClient } = await import(
					"renderer/lib/acp-session-client"
				);
				const client = createDesktopAcpSessionClient(hostUrl);
				await client.api.close({ sessionId });
				clearAcpComposerDraft(sessionId);
			},
		});

		const acp: PaneDefinition<V1PanesPaneData> = {
			...acpLifecycle,
			getIcon: (ctx) => (
				<Bot
					className={`size-3.5 ${
						ctx.pane.data.acp?.status === "running"
							? "text-success"
							: ctx.pane.data.acp?.status === "awaiting_permission"
								? "text-warning"
								: ctx.pane.data.acp?.status === "dead"
									? "text-destructive"
									: ""
					}`}
				/>
			),
			renderToolbar: (ctx) => {
				const acpData = ctx.pane.data.acp;
				return (
					<AcpPaneToolbar
						title={acpData?.latestUserMessage ?? acpData?.title ?? null}
						agentLabel={
							acpData
								? BUILTIN_AGENT_LABELS[acpData.agentDefinitionId]
								: "Agent"
						}
						paneActions={<ctx.components.PaneHeaderActions />}
					/>
				);
			},
			renderPane: (ctx: RendererContext<V1PanesPaneData>) => {
				const acpData = ctx.pane.data.acp;
				if (!acpData || !hostUrl) {
					return (
						<div className="flex h-full items-center justify-center text-sm text-fg-mute">
							{!hostUrl ? "Host unavailable" : "ACP session data missing"}
						</div>
					);
				}
				return (
					<AcpSessionPane
						sessionId={acpData.sessionId}
						hostUrl={hostUrl}
						// ACP file completion calls the host filesystem API, whose
						// workspace identity differs from the renderer/catalog one.
						workspaceId={hostWorkspaceId ?? workspaceId}
						rendererWorkspaceId={workspaceId}
						cwd={workspace?.worktreePath ?? ""}
						agentLabel={
							acpData
								? BUILTIN_AGENT_LABELS[acpData.agentDefinitionId]
								: undefined
						}
						isLaunching={acpData.isLaunching}
						creationError={acpData.creationError}
						onRetryLaunch={
							acpData.creationError && hostWorkspaceId
								? () => {
										const updateAcpPane = (next: {
											sessionId: string;
											title: string | null;
											status: NonNullable<typeof acpData.status>;
											isLaunching: boolean;
											creationError?: string;
										}) =>
											ctx.actions.updateData({
												...ctx.pane.data,
												acp: {
													...acpData,
													...next,
													title: next.title ?? undefined,
												},
											});
										void launchAcpSession({
											workspaceId: hostWorkspaceId,
											agentDefinitionId: acpData.agentDefinitionId,
											client: createDesktopAcpSessionClient(hostUrl),
											sessionId: acpData.sessionId,
											openPane: (input) =>
												updateAcpPane({ ...input, creationError: undefined }),
											onSessionCreated: (input) =>
												updateAcpPane({ ...input, isLaunching: false }),
											onSessionCreationFailed: ({ sessionId, error }) =>
												updateAcpPane({
													sessionId,
													title: null,
													status: "dead",
													isLaunching: false,
													creationError: error.message,
												}),
										}).catch(() => {});
									}
								: undefined
						}
						onSessionMetadataChange={({ title, latestUserMessage, status }) => {
							const current = ctx.pane.data.acp;
							if (
								current &&
								current.title === title &&
								current.latestUserMessage === latestUserMessage &&
								current.status === status
							)
								return;
							ctx.actions.updateData({
								...ctx.pane.data,
								acp: {
									...acpData,
									title: title ?? undefined,
									latestUserMessage: latestUserMessage ?? undefined,
									status,
								},
							});
						}}
					/>
				);
			},
			contextMenuActions: (_ctx, defaults) =>
				defaults.map((d) =>
					d.key === "close-pane" ? { ...d, label: "Close agent session" } : d,
				),
		};

		return {
			terminal,
			"file-viewer": fileViewer,
			comment,
			acp,
		};
	}, [
		t,
		probeRunning,
		killSession,
		clearShortcut,
		scrollToBottomShortcut,
		workspaceId,
		workspace?.worktreePath,
		hostUrl,
		hostWorkspaceId,
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
interface UseV1PanesWorkspaceOptions {
	hostUrl?: string | null;
	hostWorkspaceId?: string | null;
}

export function useV1PanesWorkspace(
	workspaceId: string,
	options: UseV1PanesWorkspaceOptions = {},
) {
	const { store } = useV1PanesWorkspacePaneLayout(workspaceId);
	const registry = useV1PanesRegistry(workspaceId);
	const launcher = useV1TerminalLauncher();
	const paneActions = useV1DefaultPaneActions(launcher);
	const contextMenuActions = useV1DefaultContextMenuActions(registry, launcher);
	const acpLauncher = useAcpPresetLauncher({
		store,
		hostUrl: options.hostUrl,
		hostWorkspaceId: options.hostWorkspaceId,
	});
	const openers = useV1PanesPresetOpeners(workspaceId, store, acpLauncher);

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
