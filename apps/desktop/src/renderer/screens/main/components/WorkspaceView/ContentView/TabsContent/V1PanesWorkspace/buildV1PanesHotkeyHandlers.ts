import type { PaneRegistry, WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { V1PanesPaneData } from "./types";
import type { V1TerminalLauncher } from "./useV1TerminalLauncher";

export interface V1PanesHotkeyHandlersDeps {
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>;
	registry: PaneRegistry<V1PanesPaneData>;
	launcher: V1TerminalLauncher;
	/**
	 * Opens a fresh terminal tab (NEW_GROUP). Injected so the hotkey
	 * handler stays decoupled from the preset openers hook.
	 */
	addTerminalTab: () => void;
}

export interface V1PanesHotkeyHandlers {
	closePane: () => Promise<void>;
	splitAuto: () => Promise<void>;
	splitRight: () => Promise<void>;
	splitDown: () => Promise<void>;
	equalize: () => void;
	newGroup: () => void;
	prevTab: () => void;
	nextTab: () => void;
}

/**
 * Hotkey handler implementations for the v1-panes mount.
 *
 * Mirrors v2's `useWorkspaceHotkeys` terminal-only subset (CLOSE_PANE with
 * the `onBeforeClose` guard, SPLIT_AUTO/RIGHT/DOWN, EQUALIZE, NEW_GROUP,
 * PREV/NEXT_TAB). Pure store/registry/launcher operations; the
 * `useV1PanesHotkeys` hook registers them via `useHotkey`. Held as a
 * builder so the handler logic is testable without the React effect
 * environment `useHotkey` needs.
 */
export function buildV1PanesHotkeyHandlers(
	deps: V1PanesHotkeyHandlersDeps,
): V1PanesHotkeyHandlers {
	const { store, registry, launcher, addTerminalTab } = deps;

	const closePane = async () => {
		const state = store.getState();
		const active = state.getActivePane();
		if (!active) return;
		const definition = registry[active.pane.kind];
		if (definition?.onBeforeClose) {
			const allowed = await definition.onBeforeClose(active.pane);
			if (!allowed) return;
		}
		state.closePane({ tabId: active.tabId, paneId: active.pane.id });
	};

	const splitPaneAt = async (position: "right" | "bottom") => {
		const state = store.getState();
		const active = state.getActivePane();
		if (!active) return;
		const terminalId = await launcher.create();
		state.splitPane({
			tabId: active.tabId,
			paneId: active.pane.id,
			position,
			newPane: { kind: "terminal", data: { terminalId } },
		});
	};

	return {
		closePane,
		splitAuto: async () => {
			// Split along the active pane's longer side, mirroring v2.
			const state = store.getState();
			const active = state.getActivePane();
			if (!active) return;
			// The panes engine exposes parentDirection via PaneContext; the
			// store's Pane does not carry it, so default to "right" when it
			// is unknown. v2 reads `getPaneParentDirection`; the simpler
			// heuristic here matches the daily-driver default.
			await splitPaneAt("right");
		},
		splitRight: () => splitPaneAt("right"),
		splitDown: () => splitPaneAt("bottom"),
		equalize: () => {
			const state = store.getState();
			const tab = state.getActiveTab();
			if (!tab) return;
			state.equalizeTab({ tabId: tab.id });
		},
		newGroup: addTerminalTab,
		prevTab: () => {
			const state = store.getState();
			if (!state.activeTabId || state.tabs.length === 0) return;
			const index = state.tabs.findIndex((t) => t.id === state.activeTabId);
			const prevIndex = index <= 0 ? state.tabs.length - 1 : index - 1;
			state.setActiveTab(state.tabs[prevIndex].id);
		},
		nextTab: () => {
			const state = store.getState();
			if (!state.activeTabId || state.tabs.length === 0) return;
			const index = state.tabs.findIndex((t) => t.id === state.activeTabId);
			const nextIndex =
				index >= state.tabs.length - 1 || index === -1 ? 0 : index + 1;
			state.setActiveTab(state.tabs[nextIndex].id);
		},
	};
}
