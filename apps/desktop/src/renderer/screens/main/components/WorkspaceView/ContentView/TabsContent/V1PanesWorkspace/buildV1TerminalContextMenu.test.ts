import { describe, expect, mock, test } from "bun:test";
import type { ContextMenuActionConfig } from "@superset/panes";
import { buildV1TerminalContextMenu } from "./buildV1TerminalContextMenu";
import type { V1PanesPaneData } from "./types";

/**
 * `buildV1TerminalContextMenu` is the pure, testable core of the v1-panes
 * terminal pane's context menu. It mirrors v2's terminal
 * `contextMenuActions` (copy/paste/clear/scroll-to-bottom + the panes
 * engine's default split/equalize/move/close + kill-session) but is
 * dependency-injected: `terminalRuntime`, `killSession`, hotkey display
 * strings, and i18n labels all enter as arguments so the function loads in
 * a non-Electron test environment. The `defaults` array is what the panes
 * engine injects from `<Workspace contextMenuActions=...>`; the builder
 * re-labels `close-pane` with the terminal close label and sandwiches the
 * defaults between the terminal clipboard group and the kill action.
 */
const terminalRuntimeStub = {
	getSelection: mock<(terminalId: string, instanceId: string) => string>(
		() => "",
	),
	paste: mock<(terminalId: string, text: string, instanceId: string) => void>(
		() => {},
	),
	clear: mock<(terminalId: string, instanceId: string) => void>(() => {}),
	scrollToBottom: mock<(terminalId: string, instanceId: string) => void>(
		() => {},
	),
};

const LABELS = {
	copy: "Copy",
	paste: "Paste",
	clearTerminal: "Clear",
	scrollToBottom: "Scroll to Bottom",
	killTerminalSession: "Kill Terminal Session",
	closeTerminal: "Close Terminal",
} as const;

const HOTKEYS = {
	clear: "⌘K",
	scrollToBottom: "⌘⇧↓",
} as const;

const ICONS = {
	copy: null,
	paste: null,
	clear: null,
	scrollToBottom: null,
	kill: null,
} as const;

const DEFAULTS: ContextMenuActionConfig<V1PanesPaneData>[] = [
	{ key: "split-horizontal", label: "Split Down", onSelect: () => {} },
	{ key: "close-pane", label: "Close Pane", onSelect: () => {} },
];

function makeCtx(paneId: string, terminalId: string) {
	return {
		pane: {
			id: paneId,
			kind: "terminal",
			data: { terminalId },
		},
	} as never;
}

function build(
	defaults: ContextMenuActionConfig<V1PanesPaneData>[] = DEFAULTS,
) {
	return buildV1TerminalContextMenu(
		{
			terminalRuntime: terminalRuntimeStub,
			killSession: mock(),
			labels: LABELS,
			hotkeys: HOTKEYS,
			icons: ICONS,
		},
		defaults,
	);
}

describe("buildV1TerminalContextMenu", () => {
	test("produces copy/paste/clear/scroll + merged defaults + kill, with separators", () => {
		const actions = build();
		const keys = actions.map((a) => a.key);
		expect(keys).toContain("copy");
		expect(keys).toContain("paste");
		expect(keys).toContain("clear-terminal");
		expect(keys).toContain("scroll-to-bottom");
		expect(keys).toContain("kill-terminal-session");
		// the default split + close are merged in
		expect(keys).toContain("split-horizontal");
		expect(keys).toContain("close-pane");
		expect(actions.some((a) => a.type === "separator")).toBe(true);
	});

	test("re-labels the close-pane default with the terminal close label", () => {
		const actions = build();
		const close = actions.find((a) => a.key === "close-pane");
		expect(close?.label).toBe("Close Terminal");
	});

	test("copy disabled reads selection from terminalRuntime keyed by terminalId + pane.id", () => {
		const actions = build();
		terminalRuntimeStub.getSelection.mockReturnValue("selected-text");
		const copy = actions.find((a) => a.key === "copy");
		const disabledFn = copy?.disabled;
		expect(typeof disabledFn).toBe("function");
		// selection present → enabled (false)
		expect(
			(disabledFn as (ctx: never) => boolean)(makeCtx("pane-1", "term-1")),
		).toBe(false);
		expect(terminalRuntimeStub.getSelection).toHaveBeenCalledWith(
			"term-1",
			"pane-1",
		);
	});

	test("clear action calls terminalRuntime.clear keyed by terminalId + pane.id", () => {
		const actions = build();
		const clear = actions.find((a) => a.key === "clear-terminal");
		(clear as { onSelect?: (ctx: never) => void }).onSelect?.(
			makeCtx("pane-7", "term-7"),
		);
		expect(terminalRuntimeStub.clear).toHaveBeenCalledWith("term-7", "pane-7");
	});

	test("scroll-to-bottom action calls terminalRuntime.scrollToBottom keyed by terminalId + pane.id", () => {
		const actions = build();
		const scroll = actions.find((a) => a.key === "scroll-to-bottom");
		(scroll as { onSelect?: (ctx: never) => void }).onSelect?.(
			makeCtx("pane-9", "term-9"),
		);
		expect(terminalRuntimeStub.scrollToBottom).toHaveBeenCalledWith(
			"term-9",
			"pane-9",
		);
	});

	test("kill-session action calls the injected killSession keyed by terminalId (backend identity)", () => {
		const killSession = mock<(terminalId: string) => void>();
		const actions = buildV1TerminalContextMenu(
			{
				terminalRuntime: terminalRuntimeStub,
				killSession,
				labels: LABELS,
				hotkeys: HOTKEYS,
				icons: ICONS,
			},
			DEFAULTS,
		);
		const kill = actions.find((a) => a.key === "kill-terminal-session");
		(kill as { onSelect?: (ctx: never) => void }).onSelect?.(
			makeCtx("pane-1", "term-1"),
		);
		expect(killSession).toHaveBeenCalledWith("term-1");
		expect(killSession).not.toHaveBeenCalledWith("pane-1");
	});
});
