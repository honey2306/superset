import {
	type ContextMenuActionConfig,
	type PaneRegistry,
	type RendererContext,
	resolveTabTitle,
} from "@superset/panes";
import type { ReactNode } from "react";
import type { V1PanesPaneData } from "./types";

export interface V1DefaultContextMenuActionsDeps {
	paneRegistry: PaneRegistry<V1PanesPaneData>;
	labels: {
		splitDown: string;
		splitRight: string;
		equalize: string;
		moveToTab: string;
		newTab: string;
		closePane: string;
	};
	/** Shortcut display strings, or undefined when unassigned. */
	hotkeys: {
		splitDown: string | undefined;
		splitRight: string | undefined;
		equalize: string | undefined;
		closePane: string | undefined;
	};
	icons: {
		splitDown: ReactNode;
		splitRight: ReactNode;
		equalize: ReactNode;
		move: ReactNode;
		newTab: ReactNode;
		close: ReactNode;
	};
	/** Creates a terminalId for a new split pane. */
	createTerminalId: () => Promise<string>;
}

/**
 * Default context-menu actions for the v1-panes mount.
 *
 * Mirrors v2's `useDefaultContextMenuActions` (split down/right, equalize,
 * move-to-tab/new-tab, close) typed for `V1PanesPaneData` and terminal-only:
 * the v2 split-with-chat / split-with-browser items are dropped (chat and
 * browser panes are M3+). `move-to-tab` reuses `resolveTabTitle` from
 * `@superset/panes` so moved tabs keep their live title. Dependency-
 * injected so the builder is testable without the Electron tRPC client or
 * react-icons at load time.
 */
export function buildV1DefaultContextMenuActions(
	deps: V1DefaultContextMenuActionsDeps,
): ContextMenuActionConfig<V1PanesPaneData>[] {
	const { paneRegistry, labels, hotkeys, icons, createTerminalId } = deps;
	return [
		{
			key: "split-horizontal",
			label: labels.splitDown,
			icon: icons.splitDown,
			shortcut: hotkeys.splitDown,
			onSelect: async (ctx) => {
				const terminalId = await createTerminalId();
				ctx.actions.split("down", {
					kind: "terminal",
					data: { terminalId },
				});
			},
		},
		{
			key: "split-vertical",
			label: labels.splitRight,
			icon: icons.splitRight,
			shortcut: hotkeys.splitRight,
			onSelect: async (ctx) => {
				const terminalId = await createTerminalId();
				ctx.actions.split("right", {
					kind: "terminal",
					data: { terminalId },
				});
			},
		},
		{
			key: "equalize-splits",
			label: labels.equalize,
			icon: icons.equalize,
			shortcut: hotkeys.equalize,
			onSelect: (ctx) => {
				ctx.store.getState().equalizeTab({ tabId: ctx.tab.id });
			},
		},
		{ key: "sep-move", type: "separator" },
		{
			key: "move-to-tab",
			label: labels.moveToTab,
			icon: icons.move,
			children: (ctx: RendererContext<V1PanesPaneData>) => {
				const tabs = ctx.store.getState().tabs;
				const otherTabs = tabs.filter((tab) => tab.id !== ctx.tab.id);
				const items: ContextMenuActionConfig<V1PanesPaneData>[] = otherTabs.map(
					(tab) => ({
						key: `move-to-${tab.id}`,
						label: resolveTabTitle(tab, tabs, paneRegistry),
						onSelect: () => {
							ctx.store
								.getState()
								.movePaneToTab({ paneId: ctx.pane.id, targetTabId: tab.id });
						},
					}),
				);
				if (otherTabs.length > 0) {
					items.push({ key: "sep-new-tab", type: "separator" });
				}
				items.push({
					key: "move-to-new-tab",
					label: labels.newTab,
					icon: icons.newTab,
					onSelect: () => {
						ctx.store.getState().movePaneToNewTab({ paneId: ctx.pane.id });
					},
				});
				return items;
			},
		},
		{ key: "sep-close", type: "separator" },
		{
			key: "close-pane",
			label: labels.closePane,
			icon: icons.close,
			variant: "destructive",
			shortcut: hotkeys.closePane,
			onSelect: (ctx) => ctx.actions.close(),
		},
	];
}
