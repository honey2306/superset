import type { PaneRegistry, WorkspaceStore } from "@superset/panes";
import { useHotkey } from "renderer/hotkeys";
import type { StoreApi } from "zustand/vanilla";
import { buildV1PanesHotkeyHandlers } from "./buildV1PanesHotkeyHandlers";
import type { V1PanesPaneData } from "./types";
import type { V1TerminalLauncher } from "./useV1TerminalLauncher";

/**
 * Registers the terminal-only hotkey subset for the v1-panes mount.
 *
 * Mirrors v2's `useWorkspaceHotkeys` daily-driver set: CLOSE_PANE (with the
 * registry's `onBeforeClose` guard), SPLIT_AUTO/RIGHT/DOWN, EQUALIZE,
 * NEW_GROUP, PREV/NEXT_TAB. v2's chat/browser/preset/FOCUS_PANE_* hotkeys are
 * dropped (those are M3+ or have no binding). The handler logic lives in
 * the pure `buildV1PanesHotkeyHandlers` builder; this hook only wires it
 * to `useHotkey`.
 */
export function useV1PanesHotkeys({
	store,
	registry,
	launcher,
	addTerminalTab,
}: {
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>;
	registry: PaneRegistry<V1PanesPaneData>;
	launcher: V1TerminalLauncher;
	addTerminalTab: () => void;
}) {
	const handlers = buildV1PanesHotkeyHandlers({
		store,
		registry,
		launcher,
		addTerminalTab,
	});

	useHotkey("CLOSE_PANE", () => void handlers.closePane());
	useHotkey("SPLIT_AUTO", () => void handlers.splitAuto());
	useHotkey("SPLIT_RIGHT", () => void handlers.splitRight());
	useHotkey("SPLIT_DOWN", () => void handlers.splitDown());
	useHotkey("EQUALIZE_PANE_SPLITS", () => handlers.equalize());
	useHotkey("NEW_GROUP", () => handlers.newGroup());
	useHotkey("PREV_TAB", () => handlers.prevTab());
	useHotkey("NEXT_TAB", () => handlers.nextTab());
	useHotkey("PREV_TAB_ALT", () => handlers.prevTab());
	useHotkey("NEXT_TAB_ALT", () => handlers.nextTab());
}
