import type {
	ContextMenuActionConfig,
	PaneActionConfig,
	PaneRegistry,
} from "@superset/panes";
import { useMemo } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import {
	LuColumns2,
	LuEqual,
	LuMoveRight,
	LuPlus,
	LuRows2,
	LuX,
} from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { useTranslation } from "renderer/providers/I18nProvider";
import { buildDefaultContextMenuActions } from "./buildDefaultContextMenuActions";
import { buildDefaultPaneActions } from "./buildDefaultPaneActions";
import type { PanesPaneData } from "./types";
import type { TerminalLauncher } from "./useTerminalLauncher";

/**
 * Header pane actions for the panes mount. Thin wiring over the pure
 * `buildDefaultPaneActions` builder: injects i18n labels, react-icons, and
 * the v1 terminal launcher (which only mints a `terminalId`; the pane's
 * `HostServiceTerminalPane` creates the session on mount).
 */
export function useDefaultPaneActions(
	launcher: TerminalLauncher,
): PaneActionConfig<PanesPaneData>[] {
	const { t } = useTranslation();
	return useMemo(
		() =>
			buildDefaultPaneActions({
				labels: {
					split: t("workspace.pane.split"),
					// close has no text label in v2 either — it is icon-only.
					close: "",
				},
				icons: {
					splitRows: <LuRows2 className="size-3.5" />,
					splitColumns: <LuColumns2 className="size-3.5" />,
					close: <HiMiniXMark className="size-3.5" />,
				},
				createTerminalId: launcher.create,
			}),
		[launcher, t],
	);
}

/**
 * Default context-menu actions for the panes mount. Thin wiring over the
 * pure `buildDefaultContextMenuActions` builder. Terminal-only: no
 * split-with-chat / split-with-browser (those pane kinds are M3+).
 */
export function useDefaultContextMenuActions(
	paneRegistry: PaneRegistry<PanesPaneData>,
	launcher: TerminalLauncher,
): ContextMenuActionConfig<PanesPaneData>[] {
	const { t } = useTranslation();
	const splitDownShortcut = useHotkeyDisplay("SPLIT_DOWN").text;
	const splitRightShortcut = useHotkeyDisplay("SPLIT_RIGHT").text;
	const equalizeShortcut = useHotkeyDisplay("EQUALIZE_PANE_SPLITS").text;
	const closePaneShortcut = useHotkeyDisplay("CLOSE_PANE").text;
	return useMemo(
		() =>
			buildDefaultContextMenuActions({
				paneRegistry,
				labels: {
					splitDown: t("workspace.context.splitHorizontal"),
					splitRight: t("workspace.context.splitVertical"),
					equalize: t("workspace.context.equalize"),
					moveToTab: t("workspace.context.moveToTab"),
					newTab: t("workspace.context.newTab"),
					closePane: t("workspace.context.closePane"),
				},
				hotkeys: {
					splitDown:
						splitDownShortcut !== "Unassigned" ? splitDownShortcut : undefined,
					splitRight:
						splitRightShortcut !== "Unassigned"
							? splitRightShortcut
							: undefined,
					equalize:
						equalizeShortcut !== "Unassigned" ? equalizeShortcut : undefined,
					closePane:
						closePaneShortcut !== "Unassigned" ? closePaneShortcut : undefined,
				},
				icons: {
					splitDown: <LuRows2 />,
					splitRight: <LuColumns2 />,
					equalize: <LuEqual />,
					move: <LuMoveRight />,
					newTab: <LuPlus />,
					close: <LuX />,
				},
				createTerminalId: launcher.create,
			}),
		[
			paneRegistry,
			launcher,
			t,
			splitDownShortcut,
			splitRightShortcut,
			equalizeShortcut,
			closePaneShortcut,
		],
	);
}
