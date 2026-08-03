import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { sanitizeTerminalFontFamily } from "renderer/lib/terminal/appearance";
import { buildTerminalCommand } from "renderer/lib/terminal/launch-command";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useCatalogWorkspace } from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider/selectors";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalTheme } from "renderer/stores/theme";
import { SessionKilledOverlay } from "./components";
import { DEFAULT_TERMINAL_FONT_SIZE } from "./config";
import { getDefaultTerminalBg } from "./helpers";
import {
	useFileLinkClick,
	useTerminalColdRestore,
	useTerminalConnection,
	useTerminalCwd,
	useTerminalHotkeys,
	useTerminalLifecycle,
	useTerminalModes,
	useTerminalRefs,
	useTerminalRestore,
	useTerminalStream,
} from "./hooks";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import { TerminalSearch } from "./TerminalSearch";
import type {
	TerminalExitReason,
	TerminalProps,
	TerminalStreamEvent,
} from "./types";
import { shellEscapePaths } from "./utils";
import * as v1TerminalCache from "./v1-terminal-cache";

const stripLeadingEmoji = (text: string) =>
	text.trim().replace(/^[\p{Emoji}\p{Symbol}]\s*/u, "");

export const Terminal = memo(function Terminal({
	paneId,
	tabId,
	workspaceId,
}: TerminalProps) {
	const { t } = useTranslation();
	const pane = useTabsStore((s) => s.panes[paneId]);
	const isWorkspaceRunPane = Boolean(pane?.workspaceRun?.workspaceId);
	const paneInitialCwd = pane?.initialCwd;
	const clearPaneInitialData = useTabsStore((s) => s.clearPaneInitialData);

	const collections = useCollections();
	const hostTarget = useWorkspaceHostTarget(workspaceId);
	const { workspace: catalogWorkspace } = useCatalogWorkspace(workspaceId);
	const { data: workspaceLocalStateRows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ state: collections.v2WorkspaceLocalState })
				.where(({ state }) => eq(state.workspaceId, workspaceId))
				.select(({ state }) => ({ isUnnamed: state.isUnnamed })),
		[collections, workspaceId],
	);
	const workspaceLocalState =
		workspaceLocalStateRows[0] ??
		collections.v2WorkspaceLocalState.get(workspaceId);
	const isUnnamedRef = useRef(false);
	// New Provisioning rows persist this presentation marker locally. Older v1
	// rows predate it, so retain their historical branch/name fallback until
	// the v1 presentation migration has completed.
	isUnnamedRef.current =
		workspaceLocalState?.isUnnamed ??
		catalogWorkspace?.name === catalogWorkspace?.branch;

	const { data: workspaceRunConfig } =
		electronTrpc.workspaces.getResolvedRunCommands.useQuery(
			{ workspaceId },
			{ enabled: isWorkspaceRunPane },
		);

	const workspaceRunRestartCommand = isWorkspaceRunPane
		? buildTerminalCommand(workspaceRunConfig?.commands)
		: null;
	const defaultRestartCommandRef = useRef<string | undefined>(undefined);
	defaultRestartCommandRef.current =
		workspaceRunRestartCommand ?? pane?.workspaceRun?.command;

	const hostWorkspaceUrl =
		hostTarget.status === "ready" ? hostTarget.url : null;

	const renameUnnamedWorkspaceRef = useRef<(title: string) => void>(() => {});
	renameUnnamedWorkspaceRef.current = (title: string) => {
		const cleanedTitle = stripLeadingEmoji(title);
		if (isUnnamedRef.current && cleanedTitle) {
			if (hostWorkspaceUrl) {
				void getHostServiceClientByUrl(
					hostWorkspaceUrl,
				).workspace.update.mutate({
					id: workspaceId,
					name: cleanedTitle,
				});
				return;
			}
			console.warn(
				"Workspace host is unavailable; terminal rename was skipped",
				{
					workspaceId,
					name: cleanedTitle,
				},
			);
		}
	};
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const searchAddonRef = useRef<SearchAddon | null>(null);
	const isExitedRef = useRef(false);
	const [exitStatus, setExitStatus] = useState<"killed" | "exited" | null>(
		null,
	);
	const wasKilledByUserRef = useRef(false);
	const pendingEventsRef = useRef<TerminalStreamEvent[]>([]);
	const commandBufferRef = useRef("");
	const tabIdRef = useRef(tabId);
	tabIdRef.current = tabId;
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const setPaneName = useTabsStore((s) => s.setPaneName);
	const focusedPaneId = useTabsStore((s) => s.focusedPaneIds[tabId]);
	const terminalTheme = useTerminalTheme();

	// Terminal connection state and mutations
	const {
		connectionError,
		setConnectionError,
		workspaceCwd,
		refs: {
			createOrAttach: createOrAttachRef,
			write: writeRef,
			resize: resizeRef,
			cancelCreateOrAttach: cancelCreateOrAttachRef,
			clearScrollback: clearScrollbackRef,
		},
	} = useTerminalConnection({ workspaceId });

	// Terminal CWD management
	const { updateCwdFromData } = useTerminalCwd({
		paneId,
		initialCwd: paneInitialCwd,
		workspaceCwd,
	});

	// Terminal modes tracking
	const {
		isAlternateScreenRef,
		isBracketedPasteRef,
		modeScanBufferRef,
		updateModesFromData,
		resetModes,
	} = useTerminalModes();

	// File link click handler
	const { handleFileLinkClick } = useFileLinkClick({
		workspaceId,
		projectId: catalogWorkspace?.projectId,
	});

	// URL click handler - internal browser removed
	const handleUrlClickRef = useRef<((url: string) => void) | undefined>(
		undefined,
	);
	// Always undefined now

	// Refs for stream event handlers (populated after useTerminalStream)
	// These allow flushPendingEvents to call the handlers via refs
	const handleTerminalExitRef = useRef<
		(exitCode: number, xterm: XTerm, reason?: TerminalExitReason) => void
	>(() => {});
	const handleStreamErrorRef = useRef<
		(
			event: Extract<TerminalStreamEvent, { type: "error" }>,
			xterm: XTerm,
		) => void
	>(() => {});

	const {
		isFocused,
		isFocusedRef,
		initialThemeRef,
		paneInitialCwdRef,
		clearPaneInitialDataRef,
		handleFileLinkClickRef,
		setPaneNameRef,
		handleTerminalFocusRef,
		registerClearCallbackRef,
		unregisterClearCallbackRef,
		registerScrollToBottomCallbackRef,
		unregisterScrollToBottomCallbackRef,
		registerGetSelectionCallbackRef,
		unregisterGetSelectionCallbackRef,
		registerPasteCallbackRef,
		unregisterPasteCallbackRef,
	} = useTerminalRefs({
		paneId,
		tabId,
		focusedPaneId,
		terminalTheme,
		paneInitialCwd,
		clearPaneInitialData,
		handleFileLinkClick,
		setPaneName,
		setFocusedPane,
	});

	// Terminal restore logic
	const {
		isStreamReadyRef,
		didFirstRenderRef,
		pendingInitialStateRef,
		maybeApplyInitialState,
		flushPendingEvents,
	} = useTerminalRestore({
		paneId,
		xtermRef,
		fitAddonRef,
		pendingEventsRef,
		isAlternateScreenRef,
		isBracketedPasteRef,
		modeScanBufferRef,
		updateCwdFromData,
		updateModesFromData,
		onExitEvent: (exitCode, xterm, reason) =>
			handleTerminalExitRef.current(exitCode, xterm, reason),
		onErrorEvent: (event, xterm) => handleStreamErrorRef.current(event, xterm),
		onDisconnectEvent: (reason) =>
			setConnectionError(reason || t("terminal.connectionToDaemonLost")),
	});

	// Cold restore handling
	const {
		isRestoredMode,
		setIsRestoredMode,
		setRestoredCwd,
		handleRetryConnection,
		handleStartShell,
	} = useTerminalColdRestore({
		paneId,
		tabId,
		workspaceId,
		xtermRef,
		isStreamReadyRef,
		isExitedRef,
		wasKilledByUserRef,
		isFocusedRef,
		didFirstRenderRef,
		pendingInitialStateRef,
		pendingEventsRef,
		createOrAttachRef,
		setConnectionError,
		setExitStatus,
		maybeApplyInitialState,
		flushPendingEvents,
		resetModes,
	});

	// Avoid effect re-runs: track overlay states via refs for input gating
	const isRestoredModeRef = useRef(isRestoredMode);
	isRestoredModeRef.current = isRestoredMode;
	const connectionErrorRef = useRef(connectionError);
	connectionErrorRef.current = connectionError;

	// Auto-retry connection with exponential backoff
	const retryCountRef = useRef(0);
	const MAX_RETRIES = 5;

	// Stream handling
	const { handleTerminalExit, handleStreamError, handleStreamData } =
		useTerminalStream({
			paneId,
			xtermRef,
			isStreamReadyRef,
			isExitedRef,
			wasKilledByUserRef,
			pendingEventsRef,
			setExitStatus,
			setConnectionError,
			updateModesFromData,
			updateCwdFromData,
		});

	// Populate handler refs for flushPendingEvents to use
	handleTerminalExitRef.current = handleTerminalExit;
	handleStreamErrorRef.current = handleStreamError;

	// Auto-retry when connection error is set
	useEffect(() => {
		if (!connectionError) return;
		if (isExitedRef.current) return;
		if (retryCountRef.current >= MAX_RETRIES) return;

		if (retryCountRef.current === 0) {
			xtermRef.current?.writeln(
				`\r\n\x1b[90m${t("terminal.connectionLostReconnecting")}\x1b[0m`,
			);
		}

		const delay = Math.min(1000 * 2 ** retryCountRef.current, 10_000);
		retryCountRef.current++;

		const timeout = setTimeout(handleRetryConnection, delay);
		return () => clearTimeout(timeout);
	}, [connectionError, handleRetryConnection, t]);

	const handleClearHotkey = useCallback(() => {
		const xterm = xtermRef.current;
		if (!xterm) return;
		xterm.clear();
		clearScrollbackRef.current({ paneId });
	}, [paneId, clearScrollbackRef]);

	const { isSearchOpen, setIsSearchOpen } = useTerminalHotkeys({
		isFocused,
		onClear: handleClearHotkey,
		xtermRef,
	});
	useEffect(() => {
		if (!isRestoredMode) return;
		handleStartShell();
	}, [isRestoredMode, handleStartShell]);
	const { xtermInstance, restartTerminal } = useTerminalLifecycle({
		paneId,
		tabIdRef,
		workspaceId,
		terminalRef,
		xtermRef,
		fitAddonRef,
		searchAddonRef,
		isExitedRef,
		wasKilledByUserRef,
		commandBufferRef,
		isFocusedRef,
		isRestoredModeRef,
		connectionErrorRef,
		initialThemeRef,
		handleFileLinkClickRef,
		handleUrlClickRef,
		paneInitialCwdRef,
		clearPaneInitialDataRef,
		setConnectionError,
		setExitStatus,
		setIsRestoredMode,
		setRestoredCwd,
		createOrAttachRef,
		writeRef,
		resizeRef,
		cancelCreateOrAttachRef,
		clearScrollbackRef,
		isStreamReadyRef,
		didFirstRenderRef,
		pendingInitialStateRef,
		maybeApplyInitialState,
		flushPendingEvents,
		resetModes,
		isAlternateScreenRef,
		setPaneNameRef,
		renameUnnamedWorkspaceRef,
		handleTerminalFocusRef,
		registerClearCallbackRef,
		unregisterClearCallbackRef,
		registerScrollToBottomCallbackRef,
		unregisterScrollToBottomCallbackRef,
		registerGetSelectionCallbackRef,
		unregisterGetSelectionCallbackRef,
		registerPasteCallbackRef,
		unregisterPasteCallbackRef,
		defaultRestartCommandRef,
	});

	// Stream event handler registration — the subscription itself lives in
	// v1TerminalCache and stays alive across mount/unmount cycles so data
	// keeps flowing to xterm even while the tab is hidden.
	// Placed after useTerminalLifecycle so the cache entry exists on cold mount.
	// Gated on xtermInstance so it re-runs once the lifecycle hook creates it.
	useEffect(() => {
		if (!xtermInstance) return;

		const queuedEvents = v1TerminalCache.registerHandlers(paneId, {
			onEvent: (event) => {
				if (connectionErrorRef.current && event.type === "data") {
					setConnectionError(null);
					retryCountRef.current = 0;
				}
				handleStreamData(event);
			},
			onError: (error) => {
				console.error("[Terminal] Stream subscription error:", {
					paneId,
					error: error instanceof Error ? error.message : String(error),
				});
				setConnectionError(
					error instanceof Error
						? error.message
						: t("terminal.connectionToTerminalLost"),
				);
			},
		});

		// Process lifecycle events (exit, error, disconnect) that arrived
		// while this component was unmounted.
		for (const event of queuedEvents) {
			handleStreamData(event);
		}

		return () => {
			v1TerminalCache.unregisterHandlers(paneId);
		};
	}, [paneId, xtermInstance, handleStreamData, setConnectionError, t]);

	useEffect(() => {
		const xterm = xtermRef.current;
		if (!xterm || !terminalTheme) return;
		xterm.options.theme = terminalTheme;
	}, [terminalTheme]);

	const { data: fontSettings } = electronTrpc.settings.getFontSettings.useQuery(
		undefined,
		{
			staleTime: 30_000,
		},
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: resizeRef is a stable MutableRefObject — .current is read inside the effect, not a dependency
	useEffect(() => {
		if (!fontSettings) return;
		const family = sanitizeTerminalFontFamily(fontSettings.terminalFontFamily);
		const size = fontSettings.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE;
		v1TerminalCache.updateAppearance(paneId, family, size, ({ cols, rows }) =>
			resizeRef.current({ paneId, cols, rows }),
		);
	}, [paneId, fontSettings]);

	const terminalBg = terminalTheme?.background ?? getDefaultTerminalBg();

	const handleDragOver = (event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	};

	const handleDrop = (event: React.DragEvent) => {
		event.preventDefault();
		const files = Array.from(event.dataTransfer.files);
		let text: string;
		if (files.length > 0) {
			// Native file drop (from Finder, etc.)
			const paths = files.map((file) => window.webUtils.getPathForFile(file));
			text = shellEscapePaths(paths);
		} else {
			// Internal drag (from file tree) - path is in text/plain
			const plainText = event.dataTransfer.getData("text/plain");
			if (!plainText) return;
			text = shellEscapePaths([plainText]);
		}
		if (!isExitedRef.current) {
			writeRef.current({ paneId, data: text });
		}
	};

	return (
		<div
			role="application"
			className="relative h-full w-full overflow-hidden"
			style={{ backgroundColor: terminalBg }}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			<TerminalSearch
				searchAddon={searchAddonRef.current}
				isOpen={isSearchOpen}
				onClose={() => setIsSearchOpen(false)}
			/>
			<ScrollToBottomButton terminal={xtermInstance} />
			{exitStatus === "killed" &&
				!connectionError &&
				!isRestoredMode &&
				!isWorkspaceRunPane && (
					<SessionKilledOverlay onRestart={restartTerminal} />
				)}
			<div className="h-full w-full p-2">
				<div ref={terminalRef} className="h-full w-full" />
			</div>
		</div>
	);
});
