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
import { useCatalogWorkspace } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { HostServiceTerminalPane } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/HostServiceTerminalPane";
import { useHostServiceTerminal } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useHostServiceTerminal";
import { killTerminalForPaneOrSession } from "renderer/stores/tabs/utils/terminal-cleanup";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import { isHtmlFile, isImageFile, isMarkdownFile } from "shared/file-types";
import type { FileViewerMode } from "shared/tabs-types";
import { AcpSessionPane } from "../AcpSessionPane";
import { AcpPaneToolbar } from "../AcpSessionPane/components/AcpPaneToolbar";
import {
	buildPanesAcpLifecycleRegistry,
	buildPanesLifecycleRegistry,
} from "./buildPanesLifecycleRegistry";
import { commentPaneTitle } from "./buildPanesNonTerminalRegistry";
import { buildTerminalContextMenu } from "./buildTerminalContextMenu";
import { createPanesTerminalPaneBridge } from "./createPanesTerminalPaneBridge";
import { FileViewerPaneHeaderExtras } from "./FileViewerPaneHeaderExtras";
import { FileViewerPaneTitle } from "./FileViewerPaneTitle";
import { PanesCommentContent } from "./PanesCommentContent";
import { PanesFileViewerContent } from "./PanesFileViewerContent";
import type { PanesPaneData } from "./types";
import { useAcpPresetLauncher } from "./useAcpPresetLauncher";
import {
	useDefaultContextMenuActions,
	useDefaultPaneActions,
} from "./useDefaultActions";
import { usePanesPresetOpeners } from "./usePanesPresetOpeners";
import { usePanesWorkspacePaneLayout } from "./usePanesWorkspacePaneLayout";
import { useTerminalLauncher } from "./useTerminalLauncher";

const MOD_KEY = navigator.platform.toLowerCase().includes("mac")
	? "⌘"
	: "Ctrl+";

function terminalStatusClass(status: PanesPaneData["status"]): string {
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
 * Host-backed panes pane registry. Terminal-only.
 *
 * The lifecycle slice (getTitle/titleSource/onBeforeClose/onAfterClose)
 * comes from `buildPanesLifecycleRegistry`, which takes
 * `terminalRuntimeRegistry`, `killTerminalForPaneOrSession`, the close-confirm
 * probe, and labels as injected deps so it can load in tests. The context
 * menu slice comes from `buildTerminalContextMenu`, similarly injected.
 * `renderPane`/`getIcon`/`renderHeaderExtras` are layered on here because
 * they render Electron-only / react-icons components.
 *
 * `probeRunning` and `killSession` route to the host-service terminal
 * client (the same adapter `HostServiceTerminalPane` obtains via
 * `useHostServiceTerminal`). The probe keys by `pane.data.terminalId`
 * (backend session id) — the running check is a backend question.
 * `onAfterClose` prefers registered pane cleanup, then kills the persisted
 * host session directly when the pane never mounted.
 *
 * v2-only bits intentionally dropped: the notification indicator
 * (`NotificationStatusIndicator`), the session dropdown
 * (`TerminalSessionDropdown`, depends on the v2 launcher/provider), and
 * the v2 tRPC killSession mutation (replaced by the host-service client
 * here). `renderPane` follows v1's terminal backend selection: it uses the
 * neutral `HostServiceTerminalPane` when its flag is on and the legacy
 * `Terminal` otherwise. `renderHeaderExtras` is deferred (the v2 header
 * extras host a connection indicator that depends on the v2
 * workspace-client daemon health query); M2 keeps the rich-input entry out
 * of scope until a host-agnostic connection indicator exists.
 */
function usePanesRegistry(workspaceId: string): PaneRegistry<PanesPaneData> {
	const { t } = useTranslation();
	const { workspace } = useCatalogWorkspace(workspaceId);
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

	return useMemo<PaneRegistry<PanesPaneData>>(() => {
		// NonTerminalPaneTitles no longer needed
		const lifecycle = buildPanesLifecycleRegistry({
			terminalRuntime: terminalRuntimeRegistry,
			killTerminal: (paneId, terminalId) =>
				killTerminalForPaneOrSession(paneId, terminalId, killSession),
			probeRunning,
			closeConfirmLabels: {
				title: t("workspace.paneRegistry.confirmCloseTitle"),
				description: t("workspace.paneRegistry.confirmCloseDesc"),
				confirmLabel: t("workspace.paneRegistry.confirmCloseLabel"),
			},
		});
		// Build the terminal clipboard/kill slice and merge it with the
		// panes engine's default actions (split/equalize/move/close) the
		// <Workspace> `contextMenuActions` prop injects as `defaults`. The
		// close-pane default is re-labeled with the terminal close label.
		const buildContextMenu = (
			defaults: ContextMenuActionConfig<PanesPaneData>[],
		) =>
			buildTerminalContextMenu(
				{
					terminalRuntime: terminalRuntimeRegistry,
					killSession,
					labels: {
						copy: t("common.copy"),
						paste: t("workspace.paneRegistry.paste"),
						clearTerminal: t("workspace.paneRegistry.clearTerminal"),
						scrollToBottom: t("workspace.paneRegistry.scrollToBottom"),
						killTerminalSession: t(
							"workspace.paneRegistry.killTerminalSession",
						),
						closeTerminal: t("workspace.paneRegistry.closeTerminal"),
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
		const terminal: PaneDefinition<PanesPaneData> = {
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
			renderPane: (ctx: RendererContext<PanesPaneData>) => (
				<HostServiceTerminalPane
					paneId={ctx.pane.id}
					tabId={ctx.tab.id}
					workspaceId={workspaceId}
					terminalId={ctx.pane.data.terminalId}
					initialCommand={ctx.pane.data.initialCommand}
					initialCwd={ctx.pane.data.initialCwd}
					paneBridge={createPanesTerminalPaneBridge(ctx)}
				/>
			),
			contextMenuActions: (_ctx, defaults) => buildContextMenu(defaults),
		};

		// --- file viewer -------------------------------------------------------
		const fileViewer: PaneDefinition<PanesPaneData> = {
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
							ctx.actions.updateData({
								...ctx.pane.data,
								fileViewer: { ...file, viewMode: value as FileViewerMode },
							})
						}
						onPin={() =>
							ctx.actions.updateData({
								...ctx.pane.data,
								fileViewer: { ...file, isPinned: true },
							})
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
					<PanesFileViewerContent
						paneId={ctx.pane.id}
						tabId={ctx.tab.id}
						worktreePath={workspace.worktreePath}
						fileViewer={file}
						isFocused={ctx.isActive}
						onFileViewerChange={(nextFileViewer) =>
							ctx.actions.updateData({
								...ctx.pane.data,
								fileViewer: nextFileViewer,
							})
						}
						onPin={() =>
							ctx.actions.updateData({
								...ctx.pane.data,
								fileViewer: { ...file, isPinned: true },
							})
						}
						onClose={ctx.actions.close}
					/>
				);
			},
			contextMenuActions: (_ctx, defaults) =>
				defaults.map((d) =>
					d.key === "close-pane"
						? { ...d, label: t("workspace.paneRegistry.closeFile") }
						: d,
				),
		};

		// --- comment -----------------------------------------------------------
		// Self-contained: the full `CommentPaneState` payload lives in the
		// panes pane `data.comment`, so the renderer reads no v1 store. Title
		// mirrors v1's pane name (`@<authorLogin>`); the avatar header icon
		// reuses the comment avatar when present (matches v2's registry).
		const comment: PaneDefinition<PanesPaneData> = {
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
				return <PanesCommentContent comment={c} />;
			},
			contextMenuActions: (_ctx, defaults) =>
				defaults.map((d) =>
					d.key === "close-pane"
						? { ...d, label: t("workspace.paneRegistry.closeComment") }
						: d,
				),
		};

		// devtools and webview removed with internal browser feature

		// --- acp agent pane ----------------------------------------------------
		const acpLifecycle = buildPanesAcpLifecycleRegistry();

		const acp: PaneDefinition<PanesPaneData> = {
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
			renderPane: (ctx: RendererContext<PanesPaneData>) => {
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
 * Store + registry for the Host-backed panes mount.
 *
 * The store is backed by `usePanesWorkspacePaneLayout`, which persists
 * the panes layout to the shared `workspaceLocalState` TanStack DB
 * collection (per-workspace row), so layout survives remount and workspace
 * switches without consulting the legacy tabs store. `addTerminalPane` is
 * exposed for ad-hoc split tests during validation.
 *
 * `paneActions` / `contextMenuActions` are the v1 default split/close/
 * equalize/move actions wired through the v1 terminal launcher; the panes
 * engine injects the context-menu defaults into each pane kind's
 * `contextMenuActions(ctx, defaults)`, where the terminal registry merges
 * them with its clipboard/kill slice.
 */
interface UsePanesWorkspaceOptions {
	hostUrl?: string | null;
	hostWorkspaceId?: string | null;
}

export function usePanesWorkspace(
	workspaceId: string,
	options: UsePanesWorkspaceOptions = {},
) {
	const { store } = usePanesWorkspacePaneLayout(workspaceId);
	const registry = usePanesRegistry(workspaceId);
	const launcher = useTerminalLauncher();
	const paneActions = useDefaultPaneActions(launcher);
	const contextMenuActions = useDefaultContextMenuActions(registry, launcher);
	const acpLauncher = useAcpPresetLauncher({
		store,
		hostUrl: options.hostUrl,
		hostWorkspaceId: options.hostWorkspaceId,
	});
	const openers = usePanesPresetOpeners(workspaceId, store, acpLauncher);

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
