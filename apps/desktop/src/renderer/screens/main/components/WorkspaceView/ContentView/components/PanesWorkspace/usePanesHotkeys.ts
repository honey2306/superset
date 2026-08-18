import type { PaneRegistry, WorkspaceStore } from "@superset/panes";
import { useHotkey } from "renderer/hotkeys";
import type { StoreApi } from "zustand/vanilla";
import { buildPanesHotkeyHandlers } from "./buildPanesHotkeyHandlers";
import type { PanesPaneData } from "./types";
import type { TerminalLauncher } from "./useTerminalLauncher";

/**
 * Registers the terminal-only hotkey subset for the panes mount.
 *
 * Mirrors v2's `useWorkspaceHotkeys` daily-driver set: CLOSE_PANE (with the
 * registry's `onBeforeClose` guard), SPLIT_AUTO/RIGHT/DOWN, EQUALIZE,
 * NEW_GROUP, PREV/NEXT_TAB. v2's chat/browser/preset/FOCUS_PANE_* hotkeys are
 * dropped (those are M3+ or have no binding). The handler logic lives in
 * the pure `buildPanesHotkeyHandlers` builder; this hook only wires it
 * to `useHotkey`.
 */
export function usePanesHotkeys({
	store,
	registry,
	launcher,
	addTerminalTab,
	isActive,
}: {
	store: StoreApi<WorkspaceStore<PanesPaneData>>;
	registry: PaneRegistry<PanesPaneData>;
	launcher: TerminalLauncher;
	addTerminalTab: () => void;
	isActive: boolean;
}) {
	const handlers = buildPanesHotkeyHandlers({
		store,
		registry,
		launcher,
		addTerminalTab,
	});
	const options = { enabled: isActive };

	useHotkey("CLOSE_PANE", () => void handlers.closePane(), options);
	useHotkey("SPLIT_AUTO", () => void handlers.splitAuto(), options);
	useHotkey("SPLIT_RIGHT", () => void handlers.splitRight(), options);
	useHotkey("SPLIT_DOWN", () => void handlers.splitDown(), options);
	useHotkey("EQUALIZE_PANE_SPLITS", () => handlers.equalize(), options);
	useHotkey("NEW_GROUP", () => handlers.newGroup(), options);
	useHotkey("PREV_TAB", () => handlers.prevTab(), options);
	useHotkey("NEXT_TAB", () => handlers.nextTab(), options);
	useHotkey("PREV_TAB_ALT", () => handlers.prevTab(), options);
	useHotkey("NEXT_TAB_ALT", () => handlers.nextTab(), options);
}
