import type { ContextMenuActionConfig } from "@superset/panes";
import type { ReactNode } from "react";
import type { PanesPaneData } from "./types";

/**
 * The slice of `terminalRuntimeRegistry` the context menu uses. Held as a
 * type so the dependency can be injected without importing the real
 * registry (whose module graph pulls the Electron tRPC client at load
 * time, which is unavailable in non-Electron tests).
 */
export interface PanesTerminalContextMenuRuntime {
	getSelection: (terminalId: string, instanceId: string) => string;
	paste: (terminalId: string, text: string, instanceId: string) => void;
	clear: (terminalId: string, instanceId: string) => void;
	scrollToBottom: (terminalId: string, instanceId: string) => void;
}

export interface PanesTerminalContextMenuLabels {
	copy: string;
	paste: string;
	clearTerminal: string;
	scrollToBottom: string;
	killTerminalSession: string;
	closeTerminal: string;
}

export interface PanesTerminalContextMenuHotkeys {
	clear: string | undefined;
	scrollToBottom: string | undefined;
}

export interface PanesTerminalContextMenuIcons {
	copy: ReactNode;
	paste: ReactNode;
	clear: ReactNode;
	scrollToBottom: ReactNode;
	kill: ReactNode;
}

export interface PanesTerminalContextMenuDeps {
	terminalRuntime: PanesTerminalContextMenuRuntime;
	/** Kills a still-running terminal session without closing the pane. */
	killSession: (terminalId: string) => void;
	labels: PanesTerminalContextMenuLabels;
	hotkeys: PanesTerminalContextMenuHotkeys;
	icons: PanesTerminalContextMenuIcons;
	/** Optional platform prefix for the copy/paste shortcuts (e.g. "⌘" / "Ctrl+"). */
	copyPasteShortcutPrefix?: string;
}

/**
 * Build the terminal pane's context menu actions for the panes mount.
 *
 * Mirrors v2's terminal `contextMenuActions` (copy/paste/clear/scroll-to-
 * bottom separators + close + kill-session) but is dependency-injected so
 * it loads in a non-Electron test environment. All runtime calls key by
 * `pane.data.terminalId` (backend session id) and `pane.id` (UI instance
 * id), matching how `HostServiceTerminalPane` derives terminalId and how
 * `terminalRuntimeRegistry` scopes per-instance state. Icons enter as
 * injected `ReactNode`s so the builder stays free of react-icons imports
 * (which would pull the Electron tRPC client at load time).
 *
 * The kill-session action keys by `terminalId` (the backend session to
 * kill), NOT `pane.id` — killing a session is a backend operation. This
 * differs from `onAfterClose`, which kills by `pane.id` (UI identity) via
 * `killTerminalForPane` because that routes through the host-service
 * adapter's paneId-derived terminalId.
 *
 * `defaults` is the context-menu action set the panes engine injects from
 * the `<Workspace>` `contextMenuActions` prop (split/equalize/move/close).
 * The builder re-labels the `close-pane` default with the terminal close
 * label and sandwiches the defaults between the terminal clipboard group
 * and the kill-session action, mirroring v2's terminal menu shape.
 */
export function buildTerminalContextMenu(
	deps: PanesTerminalContextMenuDeps,
	defaults: ContextMenuActionConfig<PanesPaneData>[] = [],
): ContextMenuActionConfig<PanesPaneData>[] {
	const {
		terminalRuntime,
		killSession,
		labels,
		hotkeys,
		icons,
		copyPasteShortcutPrefix = "",
	} = deps;

	const terminalActions: ContextMenuActionConfig<PanesPaneData>[] = [
		{
			key: "copy",
			label: labels.copy,
			icon: icons.copy,
			shortcut: copyPasteShortcutPrefix
				? `${copyPasteShortcutPrefix}C`
				: undefined,
			disabled: (ctx) => {
				const terminalId = ctx.pane.data.terminalId ?? "";
				return !terminalRuntime.getSelection(terminalId, ctx.pane.id);
			},
			onSelect: (ctx) => {
				const terminalId = ctx.pane.data.terminalId ?? "";
				const text = terminalRuntime.getSelection(terminalId, ctx.pane.id);
				if (text) navigator.clipboard.writeText(text);
			},
		},
		{
			key: "paste",
			label: labels.paste,
			icon: icons.paste,
			shortcut: copyPasteShortcutPrefix
				? `${copyPasteShortcutPrefix}V`
				: undefined,
			onSelect: async (ctx) => {
				const terminalId = ctx.pane.data.terminalId ?? "";
				try {
					const text = await navigator.clipboard.readText();
					if (text) {
						terminalRuntime.paste(terminalId, text, ctx.pane.id);
					}
				} catch {
					// Clipboard access denied
				}
			},
		},
		{ key: "sep-terminal-clipboard", type: "separator" },
		{
			key: "clear-terminal",
			label: labels.clearTerminal,
			icon: icons.clear,
			shortcut: hotkeys.clear,
			onSelect: (ctx) => {
				const terminalId = ctx.pane.data.terminalId ?? "";
				terminalRuntime.clear(terminalId, ctx.pane.id);
			},
		},
		{
			key: "scroll-to-bottom",
			label: labels.scrollToBottom,
			icon: icons.scrollToBottom,
			shortcut: hotkeys.scrollToBottom,
			onSelect: (ctx) => {
				const terminalId = ctx.pane.data.terminalId ?? "";
				terminalRuntime.scrollToBottom(terminalId, ctx.pane.id);
			},
		},
	];

	const modifiedDefaults = defaults.map((d) =>
		d.key === "close-pane" ? { ...d, label: labels.closeTerminal } : d,
	);

	const killAction: ContextMenuActionConfig<PanesPaneData> = {
		key: "kill-terminal-session",
		label: labels.killTerminalSession,
		icon: icons.kill,
		variant: "destructive",
		onSelect: (ctx) => {
			const terminalId = ctx.pane.data.terminalId ?? "";
			killSession(terminalId);
		},
	};

	return [
		...terminalActions,
		{ key: "sep-terminal-defaults", type: "separator" },
		...modifiedDefaults,
		{ key: "sep-terminal-kill", type: "separator" },
		killAction,
	];
}
