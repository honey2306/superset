/** Host-service-backed terminal pane shared by both pane hosts. */

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
import { useHotkey } from "renderer/hotkeys";
import { useTerminalFilePolicy } from "renderer/lib/clickPolicy/policies/useTerminalFilePolicy";
import { useTerminalUrlPolicy } from "renderer/lib/clickPolicy/policies/useTerminalUrlPolicy";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTerminalAppearance } from "renderer/lib/terminal/appearance/useTerminalAppearance";
import { useTerminalCallbacksStore } from "renderer/lib/terminal/terminal-callbacks";
import { registerTerminalCleanup } from "renderer/lib/terminal/terminal-cleanup";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import type { ConnectionState } from "renderer/lib/terminal/terminal-ws-transport";
import { watchWorkspaceRunCompletion } from "renderer/lib/terminal/workspace-run-completion";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useProjectDefaultApp } from "renderer/routes/_local/hooks/useProjectDefaultApp";
import { useCatalogWorkspace } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { useTheme } from "renderer/stores/theme/store";
import { resolveTerminalThemeType } from "renderer/stores/theme/utils";
import type { PaneStatus } from "shared/tabs-types";
import { TerminalExitedOverlay } from "./components/TerminalExitedOverlay";
import { useHostServiceTerminal } from "./hooks/useHostServiceTerminal";
import { useTerminalCwd } from "./hooks/useTerminalCwd";
import { useTerminalHotkeys } from "./hooks/useTerminalHotkeys";
import type {
	HostServiceTerminalPaneBridge,
	HostServiceTerminalPaneSnapshot,
} from "./host-service-terminal-pane-bridge";
import { registerHostTerminalBackend } from "./host-terminal-backend";
import {
	TerminalRichInput,
	terminalRichInputOpenStore,
	useTerminalRichInputOpen,
} from "./RichInput";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import { TerminalSearch } from "./TerminalSearch";
import { buildTerminalFileLinkAction } from "./terminal-file-link-action";

export interface HostServiceTerminalPaneProps {
	paneId: string;
	tabId: string;
	workspaceId: string;
	/** Persisted backend identity supplied by the @superset/panes host. */
	terminalId?: string;
	/** Routes pane state/lifecycle writes to a non-legacy UI host. */
	paneBridge: HostServiceTerminalPaneBridge;
	/**
	 * Optional shell command run once on session create (preset launch).
	 * When provided, forwarded to host-service `createSession` as
	 * `initialCommand`; when omitted, the session spawns a plain shell.
	 * Used by the panes mount to launch agent presets.
	 */
	initialCommand?: string;
	/**
	 * Optional working directory for the session. When provided, takes
	 * precedence over the v1 tabs store pane's `initialCwd`. Used by the
	 * panes mount (whose panes do not live in the v1 tabs store).
	 */
	initialCwd?: string;
}

export function HostServiceTerminalPane({
	paneId,
	tabId,
	workspaceId,
	terminalId: requestedTerminalId,
	paneBridge,
	initialCommand,
	initialCwd,
}: HostServiceTerminalPaneProps) {
	const { t } = useTranslation();
	const { workspace: workspaceData } = useCatalogWorkspace(workspaceId);
	const { app: defaultOpenInApp } = useProjectDefaultApp(
		workspaceData?.projectId,
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
	const paneBridgeRef = useRef(paneBridge);
	paneBridgeRef.current = paneBridge;
	const paneSnapshot = paneBridge.getSnapshot();
	const getPaneSnapshot = useCallback(
		(): HostServiceTerminalPaneSnapshot | null =>
			paneBridgeRef.current.getSnapshot(),
		[],
	);
	const isCurrentPaneDestroyed = useCallback(
		() => paneBridgeRef.current.isDestroyed(),
		[],
	);
	const setPaneTitle = useCallback((title: string) => {
		paneBridgeRef.current.setTitle(title);
	}, []);
	const setPaneStatus = useCallback((nextStatus: PaneStatus) => {
		paneBridgeRef.current.setStatus(nextStatus);
	}, []);
	const setPaneLifecycleScript = useCallback(
		(
			script: NonNullable<HostServiceTerminalPaneSnapshot["lifecycleScript"]>,
		) => {
			paneBridgeRef.current.setLifecycleScript(script);
		},
		[],
	);
	const setWorkspaceRunState = useCallback(
		(state: "running" | "stopped-by-user" | "stopped-by-exit") => {
			paneBridgeRef.current.setWorkspaceRunState(state);
		},
		[],
	);
	const closePane = useCallback(() => paneBridgeRef.current.close(), []);
	const clearPaneInitialData = useCallback(
		() => paneBridgeRef.current.clearInitialData(),
		[],
	);
	const updatePaneCwd = useCallback(
		(cwd: string | null, confirmed: boolean) => {
			paneBridgeRef.current.setCwd(cwd, confirmed);
		},
		[],
	);
	const initialCwdRef = useRef(initialCwd ?? paneSnapshot?.initialCwd);
	initialCwdRef.current = initialCwd ?? paneSnapshot?.initialCwd;
	const initialCommandRef = useRef(initialCommand);
	initialCommandRef.current = initialCommand;
	const { updateCwdFromData } = useTerminalCwd({
		paneId,
		initialCwd: initialCwd ?? paneSnapshot?.initialCwd,
		workspaceCwd: workspaceData?.worktreePath,
		onCwdChange: updatePaneCwd,
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

	const terminalId =
		adapter?.getTerminalId(paneId) ?? requestedTerminalId ?? paneId;
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
	const isFocused = paneBridge.isFocused;
	const agentBindings = useTerminalAgentBindingsAtHost(
		hostUrl,
		hostWorkspaceId,
	);
	const agentBinding = agentBindings.get(terminalId);
	const wasAgentTerminalRef = useRef(false);
	const workspaceRunCompletionMarker =
		paneSnapshot?.workspaceRun?.completionMarker;

	// A workspace run executes inside a persistent interactive shell. The PTY
	// stays alive when the command returns, so track the command's OSC marker
	// rather than waiting for terminal exit. The registry-owned watch survives
	// inactive-tab unmounts while the transport remains parked.
	useEffect(() => {
		if (!workspaceRunCompletionMarker) return;
		const marker = workspaceRunCompletionMarker;
		watchWorkspaceRunCompletion({
			terminalId,
			instanceId,
			marker,
			onComplete: () => {
				const liveRun = getPaneSnapshot()?.workspaceRun;
				if (
					liveRun?.state === "running" &&
					liveRun.completionMarker === marker
				) {
					setWorkspaceRunState("stopped-by-exit");
				}
			},
		});
	}, [
		getPaneSnapshot,
		instanceId,
		setWorkspaceRunState,
		terminalId,
		workspaceRunCompletionMarker,
	]);

	useEffect(() => {
		if (!hostUrl || !hostWorkspaceId) return;
		return registerHostTerminalBackend(workspaceId, {
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
		setPaneStatus(nextStatus);
	}, [agentBinding, isFocused, setPaneStatus]);

	const handleClear = useCallback(() => {
		terminalRuntimeRegistry.clear(terminalId, instanceId);
	}, [terminalId, instanceId]);
	const { isSearchOpen, setIsSearchOpen } = useTerminalHotkeys({
		isFocused,
		onClear: handleClear,
		xtermRef,
	});

	const isRichInputOpen = useTerminalRichInputOpen();
	useHotkey(
		"TOGGLE_TERMINAL_RICH_INPUT",
		() => terminalRichInputOpenStore.toggle(),
		{ enabled: isFocused, preventDefault: true },
	);

	// Create the host-service session, then mount + connect the runtime.
	useEffect(() => {
		const adp = adapter;
		if (!adp || !enabled) return;
		const a = adp;
		let cancelled = false;
		setError(null);
		setRuntimeReady(false);
		// Keep this registration while the pane is parked. Inactive tabs unmount
		// their React tree, but closing them later must still dispose the host PTY.
		registerTerminalCleanup(paneId, () => a.kill(paneId));

		async function setup() {
			try {
				await a.createOrAttach({
					paneId,
					tabId,
					terminalId: requestedTerminalId,
					cols: 80,
					rows: 24,
					cwd: initialCwdRef.current,
					command: initialCommandRef.current,
					themeType: themeTypeRef.current,
				});
				if (cancelled) {
					if (isCurrentPaneDestroyed()) {
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
				clearPaneInitialData();
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
			a.detach(paneId);
			xtermRef.current = null;
		};
	}, [
		adapter,
		enabled,
		paneId,
		tabId,
		requestedTerminalId,
		instanceId,
		clearPaneInitialData,
		isCurrentPaneDestroyed,
		t,
	]);

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
				setPaneStatus("idle");
				const livePane = getPaneSnapshot();
				if (livePane?.workspaceRun) {
					setWorkspaceRunState("stopped-by-exit");
				}
				if (livePane?.lifecycleScript) {
					setPaneLifecycleScript({
						...livePane.lifecycleScript,
						state: info.exitCode === 0 ? "succeeded" : "failed",
						exitCode: info.exitCode,
					});
					setPaneStatus(info.exitCode === 0 ? "review" : "failed");
				}
				if (
					info.exitCode === 0 &&
					!livePane?.workspaceRun &&
					!livePane?.lifecycleScript &&
					!wasAgentTerminalRef.current
				) {
					closePane();
					return;
				}
				if (wasAgentTerminalRef.current) {
					setPaneStatus(info.exitCode === 0 ? "review" : "failed");
				}
				setExitCode(info.exitCode);
			},
			instanceId,
		);
	}, [
		runtimeReady,
		terminalId,
		instanceId,
		closePane,
		getPaneSnapshot,
		setPaneStatus,
		setPaneLifecycleScript,
		setWorkspaceRunState,
	]);

	const handleRestart = useCallback(async () => {
		if (!adapter || isRestarting) return;
		setIsRestarting(true);
		setError(null);
		try {
			const currentPane = getPaneSnapshot();
			await adapter.restart({
				paneId,
				tabId,
				terminalId: requestedTerminalId,
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
	}, [
		adapter,
		getPaneSnapshot,
		instanceId,
		isRestarting,
		paneId,
		requestedTerminalId,
		tabId,
	]);

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
			if (title) setPaneTitle(title);
		};
		updateTitle();
		return terminalRuntimeRegistry.onTitleChange(tid, updateTitle, instanceId);
	}, [adapter, enabled, paneId, instanceId, runtimeReady, setPaneTitle]);

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
					if (!hostUrl || !hostWorkspaceId) return null;
					try {
						return await getHostServiceClientByUrl(
							hostUrl,
						).filesystem.statPath.mutate({
							path,
							workspaceId: hostWorkspaceId,
						});
					} catch {
						return null;
					}
				},
				onFileLinkClick: (event, link) => {
					const action = filePolicy.getAction(event);
					if (!action || !link.resolvedPath) return;
					event.preventDefault();
					const linkAction = buildTerminalFileLinkAction(
						action,
						{ ...link, resolvedPath: link.resolvedPath },
						defaultOpenInApp ?? "cursor",
					);
					if (linkAction.kind === "external") {
						void electronTrpcClient.external.openInApp.mutate(linkAction.input);
						return;
					}
					paneBridgeRef.current.openFileViewer(linkAction.input);
				},
				onUrlClick: (event: MouseEvent, url: string) => {
					const action = urlPolicy.getAction(event);
					if (!action) return;
					event.preventDefault();
					// Internal browser removed - always open externally
					void electronTrpcClient.external.openUrl.mutate(url);
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
		hostUrl,
		hostWorkspaceId,
		defaultOpenInApp,
	]);

	if (status === "starting") {
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-fg-mute">
				{t("terminal.connectionLostReconnecting")}
			</div>
		);
	}

	if (status === "unavailable" || error) {
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-destructive">
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
		<div className="flex h-full w-full flex-col overflow-hidden">
			<div className="relative min-h-0 flex-1 w-full overflow-hidden">
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
					<div className="pointer-events-none absolute right-2 bottom-2 rounded bg-background/80 px-2 py-1 text-xs text-fg-mute">
						{t("terminal.connectionLostReconnecting")}
					</div>
				)}
			</div>
			<TerminalRichInput
				workspaceId={workspaceId}
				terminalId={terminalId}
				terminalInstanceId={instanceId}
				isOpen={isRichInputOpen}
				onClose={() => terminalRichInputOpenStore.close()}
			/>
		</div>
	);
}
