/**
 * Host-service terminal pane for v1 workspace (Milestone 2).
 *
 * When the `v1-host-service-terminal` feature flag is enabled, this component
 * replaces the legacy v1 Terminal's data path with the v2-grade byte-safe
 * pipeline: terminalRuntimeRegistry + terminal-ws-transport. xterm receives
 * Uint8Array directly from the WebSocket binary frames, so split UTF-8
 * sequences are handled by xterm's internal state machine instead of being
 * mangled by per-chunk toString("utf8").
 *
 * The v1 tab/pane UX (container, context menu, hotkeys) is preserved — this
 * pane is a drop-in replacement for the data transport only.
 *
 * See: plans/20260724-v1-v2-terminal-fusion.md (Milestone 2)
 */

import { FEATURE_FLAGS } from "@superset/shared/constants";
import type { Terminal as XTerm } from "@xterm/xterm";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useTerminalAgentBindingsAtHost } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { deriveTerminalAgentStatus } from "renderer/hooks/host-service/useTerminalAgentStatuses/deriveTerminalAgentStatus";
import { useTerminalFilePolicy } from "renderer/lib/clickPolicy/policies/useTerminalFilePolicy";
import { useTerminalUrlPolicy } from "renderer/lib/clickPolicy/policies/useTerminalUrlPolicy";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";
import { useTerminalAppearance } from "renderer/lib/terminal/appearance/useTerminalAppearance";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import type { ConnectionState } from "renderer/lib/terminal/terminal-ws-transport";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";
import {
	killTerminalForPane,
	registerTerminalCleanup,
} from "renderer/stores/tabs/utils/terminal-cleanup";
import { setPaneWorkspaceRunState } from "renderer/stores/tabs/workspace-run";
import { useTheme } from "renderer/stores/theme/store";
import { resolveTerminalThemeType } from "renderer/stores/theme/utils";
import { TerminalExitedOverlay } from "./components/TerminalExitedOverlay";
import { useHostServiceTerminal } from "./hooks/useHostServiceTerminal";
import { useTerminalCwd } from "./hooks/useTerminalCwd";
import { useTerminalHotkeys } from "./hooks/useTerminalHotkeys";
import { isPaneDestroyed } from "./pane-guards";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import { TerminalSearch } from "./TerminalSearch";
import { registerV1HostTerminalBackend } from "./v1-host-terminal-backend";
import * as v1TerminalCache from "./v1-terminal-cache";

export interface HostServiceTerminalPaneProps {
	paneId: string;
	tabId: string;
	workspaceId: string;
}

export function HostServiceTerminalPane({
	paneId,
	tabId,
	workspaceId,
}: HostServiceTerminalPaneProps) {
	const { t } = useTranslation();
	const { data: workspaceData } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ staleTime: 30_000 },
	);
	const { adapter, enabled, status, hostUrl, hostWorkspaceId } =
		useHostServiceTerminal({
			workspaceId,
			worktreePath: workspaceData?.worktreePath,
		});
	const filePolicy = useTerminalFilePolicy();
	const urlPolicy = useTerminalUrlPolicy();
	const containerRef = useRef<HTMLDivElement | null>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [runtimeReady, setRuntimeReady] = useState(false);
	const [exitCode, setExitCode] = useState<number | null>(null);
	const [isRestarting, setIsRestarting] = useState(false);
	const pane = useTabsStore((state) => state.panes[paneId]);
	const focusedPaneId = useTabsStore((state) => state.focusedPaneIds[tabId]);
	const setPaneName = useTabsStore((state) => state.setPaneName);
	const setPaneStatus = useTabsStore((state) => state.setPaneStatus);
	const setPaneLifecycleScript = useTabsStore(
		(state) => state.setPaneLifecycleScript,
	);
	const removePane = useTabsStore((state) => state.removePane);
	const addFileViewerPane = useTabsStore((state) => state.addFileViewerPane);
	const openInBrowserPane = useTabsStore((state) => state.openInBrowserPane);
	const addBrowserTab = useTabsStore((state) => state.addBrowserTab);
	const clearPaneInitialData = useTabsStore(
		(state) => state.clearPaneInitialData,
	);
	const initialCwdRef = useRef(pane?.initialCwd);
	initialCwdRef.current = pane?.initialCwd;
	const { updateCwdFromData } = useTerminalCwd({
		paneId,
		initialCwd: pane?.initialCwd,
		workspaceCwd: workspaceData?.worktreePath,
	});

	const appearance = useTerminalAppearance();
	const appearanceRef = useRef(appearance);
	appearanceRef.current = appearance;

	const activeTheme = useTheme();
	const themeType = resolveTerminalThemeType({
		activeThemeType: activeTheme?.type,
	});
	const themeTypeRef = useRef(themeType);
	themeTypeRef.current = themeType;

	const terminalId = adapter?.getTerminalId(paneId) ?? paneId;
	const instanceId = paneId;

	const subscribe = useCallback(
		(callback: () => void) =>
			terminalRuntimeRegistry.onStateChange(terminalId, callback, instanceId),
		[terminalId, instanceId],
	);
	const getSnapshot = useCallback(
		(): ConnectionState =>
			terminalRuntimeRegistry.getConnectionState(terminalId, instanceId),
		[terminalId, instanceId],
	);
	const connectionState = useSyncExternalStore(subscribe, getSnapshot);
	const isFocused = focusedPaneId === paneId;
	const agentBindings = useTerminalAgentBindingsAtHost(
		hostUrl,
		hostWorkspaceId,
	);
	const agentBinding = agentBindings.get(terminalId);
	const wasAgentTerminalRef = useRef(false);

	useEffect(() => {
		if (!hostUrl || !hostWorkspaceId) return;
		return registerV1HostTerminalBackend(workspaceId, {
			hostUrl,
			hostWorkspaceId,
		});
	}, [hostUrl, hostWorkspaceId, workspaceId]);

	useEffect(() => {
		if (!agentBinding) return;
		wasAgentTerminalRef.current = true;
		const nextStatus = deriveTerminalAgentStatus({
			lastEventType: agentBinding.lastEventType,
			lastEventAt: agentBinding.lastEventAt,
			lastSeenAt: isFocused ? agentBinding.lastEventAt : undefined,
		});
		setPaneStatus(paneId, nextStatus);
	}, [agentBinding, isFocused, paneId, setPaneStatus]);

	const handleClear = useCallback(() => {
		terminalRuntimeRegistry.clear(terminalId, instanceId);
	}, [terminalId, instanceId]);
	const { isSearchOpen, setIsSearchOpen } = useTerminalHotkeys({
		isFocused,
		onClear: handleClear,
		xtermRef,
	});

	// Create the host-service session, then mount + connect the runtime.
	useEffect(() => {
		const adp = adapter;
		if (!adp || !enabled) return;
		const a = adp;
		let cancelled = false;
		setError(null);
		setRuntimeReady(false);
		// A feature-flag refresh can move an already-mounted pane from the
		// legacy backend to host-service. Retire the parked legacy runtime first
		// so the same pane cannot leave two live PTYs behind.
		if (v1TerminalCache.has(paneId)) {
			killTerminalForPane(paneId);
			v1TerminalCache.dispose(paneId);
		}
		// Keep this registration while the pane is parked. Inactive tabs unmount
		// their React tree, but closing them later must still dispose the host PTY.
		registerTerminalCleanup(paneId, () => a.kill(paneId));

		async function setup() {
			try {
				await a.createOrAttach({
					paneId,
					tabId,
					cols: 80,
					rows: 24,
					cwd: initialCwdRef.current,
					themeType: themeTypeRef.current,
				});
				if (cancelled) {
					if (isPaneDestroyed(useTabsStore.getState().panes, paneId)) {
						await a.kill(paneId);
					}
					return;
				}

				const container = containerRef.current;
				if (!container) return;

				const tid = a.getTerminalId(paneId);
				if (!tid) return;

				const wsUrl = a.getWebsocketUrl(paneId, themeTypeRef.current);
				terminalRuntimeRegistry.mount(
					tid,
					container,
					appearanceRef.current,
					instanceId,
				);
				terminalRuntimeRegistry.connect(tid, wsUrl, instanceId);
				xtermRef.current = terminalRuntimeRegistry.getTerminal(tid, instanceId);
				clearPaneInitialData(paneId);
				setRuntimeReady(true);
			} catch (err) {
				if (!cancelled) {
					setError(
						err instanceof Error
							? err.message
							: t("terminal.connectionToTerminalLost"),
					);
				}
			}
		}

		void setup();
		return () => {
			cancelled = true;
			if (
				!isPaneDestroyed(useTabsStore.getState().panes, paneId) &&
				posthog.isFeatureEnabled(FEATURE_FLAGS.V1_HOST_SERVICE_TERMINAL) ===
					false
			) {
				// A live flag rollback switches this pane back to legacy. Kill
				// the host session so both backends cannot survive for one pane.
				void a.kill(paneId);
			} else {
				a.detach(paneId);
			}
			xtermRef.current = null;
		};
	}, [adapter, enabled, paneId, tabId, instanceId, clearPaneInitialData, t]);

	// Reconnect when the host URL/token source changes. A visual theme change
	// updates xterm appearance below and must not tear down a live shell.
	useEffect(() => {
		if (!adapter || !enabled) return;
		const tid = adapter.getTerminalId(paneId);
		if (!tid) return;
		const wsUrl = adapter.getWebsocketUrl(paneId, themeTypeRef.current);
		terminalRuntimeRegistry.reconnect(tid, wsUrl, instanceId);
	}, [adapter, enabled, paneId, instanceId]);

	// Update appearance on theme/font changes.
	useEffect(() => {
		if (!adapter || !enabled) return;
		const tid = adapter.getTerminalId(paneId);
		if (!tid) return;
		terminalRuntimeRegistry.updateAppearance(tid, appearance, instanceId);
	}, [adapter, enabled, paneId, instanceId, appearance]);

	// OSC-7 cwd tracking is an ASCII control sequence, but surrounding output
	// is arbitrary UTF-8. A streaming decoder preserves split code points while
	// feeding the existing v1 cwd parser.
	useEffect(() => {
		if (!runtimeReady) return;
		const decoder = new TextDecoder();
		return terminalRuntimeRegistry.onData(
			terminalId,
			(data) => updateCwdFromData(decoder.decode(data, { stream: true })),
			instanceId,
		);
	}, [runtimeReady, terminalId, instanceId, updateCwdFromData]);

	useEffect(() => {
		if (!runtimeReady) return;
		return terminalRuntimeRegistry.onExit(
			terminalId,
			(info) => {
				setPaneStatus(paneId, "idle");
				const livePane = useTabsStore.getState().panes[paneId];
				if (livePane?.workspaceRun) {
					setPaneWorkspaceRunState(paneId, "stopped-by-exit");
				}
				if (livePane?.lifecycleScript) {
					setPaneLifecycleScript(paneId, {
						...livePane.lifecycleScript,
						state: info.exitCode === 0 ? "succeeded" : "failed",
						exitCode: info.exitCode,
					});
					setPaneStatus(paneId, info.exitCode === 0 ? "review" : "failed");
				}
				if (
					info.exitCode === 0 &&
					!livePane?.workspaceRun &&
					!livePane?.lifecycleScript &&
					!wasAgentTerminalRef.current
				) {
					removePane(paneId);
					return;
				}
				if (wasAgentTerminalRef.current) {
					setPaneStatus(paneId, info.exitCode === 0 ? "review" : "failed");
				}
				setExitCode(info.exitCode);
			},
			instanceId,
		);
	}, [
		runtimeReady,
		terminalId,
		instanceId,
		paneId,
		removePane,
		setPaneStatus,
		setPaneLifecycleScript,
	]);

	const handleRestart = useCallback(async () => {
		if (!adapter || isRestarting) return;
		setIsRestarting(true);
		setError(null);
		try {
			const currentPane = useTabsStore.getState().panes[paneId];
			await adapter.restart({
				paneId,
				tabId,
				cols: xtermRef.current?.cols ?? 80,
				rows: xtermRef.current?.rows ?? 24,
				cwd: currentPane?.cwd ?? currentPane?.initialCwd,
				themeType: themeTypeRef.current,
			});
			const tid = adapter.getTerminalId(paneId);
			const container = containerRef.current;
			if (!tid || !container) return;
			terminalRuntimeRegistry.mount(
				tid,
				container,
				appearanceRef.current,
				instanceId,
			);
			terminalRuntimeRegistry.connect(
				tid,
				adapter.getWebsocketUrl(paneId, themeTypeRef.current),
				instanceId,
			);
			xtermRef.current = terminalRuntimeRegistry.getTerminal(tid, instanceId);
			setExitCode(null);
			setRuntimeReady(true);
			xtermRef.current?.focus();
		} catch (restartError) {
			setError(
				restartError instanceof Error
					? restartError.message
					: "Failed to restart terminal",
			);
		} finally {
			setIsRestarting(false);
		}
	}, [adapter, instanceId, isRestarting, paneId, tabId]);

	// Keep the existing v1 context-menu actions backed by the shared runtime.
	useEffect(() => {
		if (!adapter || !enabled) return;
		const callbacks = useTerminalCallbacksStore.getState();
		callbacks.registerClearCallback(paneId, () => {
			const tid = adapter.getTerminalId(paneId);
			if (tid) terminalRuntimeRegistry.clear(tid, instanceId);
		});
		callbacks.registerScrollToBottomCallback(paneId, () => {
			const tid = adapter.getTerminalId(paneId);
			if (tid) terminalRuntimeRegistry.scrollToBottom(tid, instanceId);
		});
		callbacks.registerGetSelectionCallback(paneId, () => {
			const tid = adapter.getTerminalId(paneId);
			if (!tid) return "";
			return terminalRuntimeRegistry
				.getSelection(tid, instanceId)
				.split("\n")
				.map((line) => line.trimEnd())
				.join("\n");
		});
		callbacks.registerPasteCallback(paneId, (text) => {
			const tid = adapter.getTerminalId(paneId);
			if (tid) terminalRuntimeRegistry.paste(tid, text, instanceId);
		});

		return () => {
			const current = useTerminalCallbacksStore.getState();
			current.unregisterClearCallback(paneId);
			current.unregisterScrollToBottomCallback(paneId);
			current.unregisterGetSelectionCallback(paneId);
			current.unregisterPasteCallback(paneId);
		};
	}, [adapter, enabled, paneId, instanceId]);

	useEffect(() => {
		if (!adapter || !enabled || !runtimeReady) return;
		const tid = adapter.getTerminalId(paneId);
		if (!tid) return;
		const updateTitle = () => {
			const title = terminalRuntimeRegistry.getTitle(tid, instanceId);
			if (title) setPaneName(paneId, title);
		};
		updateTitle();
		return terminalRuntimeRegistry.onTitleChange(tid, updateTitle, instanceId);
	}, [adapter, enabled, paneId, instanceId, runtimeReady, setPaneName]);

	useEffect(() => {
		if (!isFocused || !runtimeReady) return;
		xtermRef.current?.focus();
	}, [isFocused, runtimeReady]);

	// Register link handlers for file/URL clicks using centralized click policy.
	useEffect(() => {
		if (!adapter || !enabled || !runtimeReady) return;
		const tid = adapter.getTerminalId(paneId);
		if (!tid) return;
		terminalRuntimeRegistry.setLinkHandlers(
			tid,
			{
				stat: async (path) => {
					try {
						return await electronTrpcClient.external.statPath.mutate({
							path,
							workspaceId,
						});
					} catch {
						return null;
					}
				},
				onFileLinkClick: (event, link) => {
					const action = filePolicy.getAction(event);
					if (!action || !link.resolvedPath) return;
					event.preventDefault();
					if (action === "external" || link.isDirectory) {
						void electronTrpcClient.external.openFileInEditor.mutate({
							path: link.resolvedPath,
							line: link.row,
							column: link.col,
							projectId: workspaceData?.projectId,
						});
						return;
					}
					addFileViewerPane(workspaceId, {
						filePath: link.resolvedPath,
						line: link.row,
						column: link.col,
						openInNewTab: action === "newTab",
					});
				},
				onUrlClick: (event: MouseEvent, url: string) => {
					const action = urlPolicy.getAction(event);
					if (!action) return;
					event.preventDefault();
					if (action === "external") {
						void electronTrpcClient.external.openUrl.mutate(url);
					} else if (action === "newTab") {
						addBrowserTab(workspaceId, url);
					} else {
						openInBrowserPane(workspaceId, url);
					}
				},
			},
			instanceId,
		);
	}, [
		adapter,
		enabled,
		paneId,
		instanceId,
		runtimeReady,
		filePolicy,
		urlPolicy,
		workspaceId,
		workspaceData?.projectId,
		addFileViewerPane,
		addBrowserTab,
		openInBrowserPane,
	]);

	if (status === "starting") {
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
				{t("terminal.connectionLostReconnecting")}
			</div>
		);
	}

	if (status === "unavailable" || error) {
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-red-500">
				{error ?? t("terminal.connectionToDaemonLost")}
			</div>
		);
	}

	const terminal = runtimeReady
		? terminalRuntimeRegistry.getTerminal(terminalId, instanceId)
		: null;
	const searchAddon = runtimeReady
		? terminalRuntimeRegistry.getSearchAddon(terminalId, instanceId)
		: null;

	return (
		<div className="relative h-full w-full overflow-hidden">
			<TerminalSearch
				searchAddon={searchAddon}
				isOpen={isSearchOpen}
				onClose={() => setIsSearchOpen(false)}
			/>
			<div ref={containerRef} className="h-full w-full" />
			<ScrollToBottomButton terminal={terminal} />
			{exitCode !== null && (
				<TerminalExitedOverlay
					exitCode={exitCode}
					isRestarting={isRestarting}
					onRestart={() => void handleRestart()}
				/>
			)}
			{connectionState === "closed" && exitCode === null && (
				<div className="pointer-events-none absolute right-2 bottom-2 rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground">
					{t("terminal.connectionLostReconnecting")}
				</div>
			)}
		</div>
	);
}
