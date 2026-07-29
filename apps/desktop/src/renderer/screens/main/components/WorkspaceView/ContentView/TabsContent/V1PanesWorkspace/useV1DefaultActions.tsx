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
import { buildV1DefaultContextMenuActions } from "./buildV1DefaultContextMenuActions";
import { buildV1DefaultPaneActions } from "./buildV1DefaultPaneActions";
import type { V1PanesPaneData } from "./types";
import type { V1TerminalLauncher } from "./useV1TerminalLauncher";

/**
 * Header pane actions for the v1-panes mount. Thin wiring over the pure
 * `buildV1DefaultPaneActions` builder: injects i18n labels, react-icons, and
 * the v1 terminal launcher (which only mints a `terminalId`; the pane's
 * `HostServiceTerminalPane` creates the session on mount).
 */
export function useV1DefaultPaneActions(
	launcher: V1TerminalLauncher,
): PaneActionConfig<V1PanesPaneData>[] {
	const { t } = useTranslation();
	return useMemo(
		() =>
			buildV1DefaultPaneActions({
				labels: {
					split: t("v2Workspace.pane.split"),
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
 * Default context-menu actions for the v1-panes mount. Thin wiring over the
 * pure `buildV1DefaultContextMenuActions` builder. Terminal-only: no
 * split-with-chat / split-with-browser (those pane kinds are M3+).
 */
export function useV1DefaultContextMenuActions(
	paneRegistry: PaneRegistry<V1PanesPaneData>,
	launcher: V1TerminalLauncher,
): ContextMenuActionConfig<V1PanesPaneData>[] {
	const { t } = useTranslation();
	const splitDownShortcut = useHotkeyDisplay("SPLIT_DOWN").text;
	const splitRightShortcut = useHotkeyDisplay("SPLIT_RIGHT").text;
	const equalizeShortcut = useHotkeyDisplay("EQUALIZE_PANE_SPLITS").text;
	const closePaneShortcut = useHotkeyDisplay("CLOSE_PANE").text;
	return useMemo(
		() =>
			buildV1DefaultContextMenuActions({
				paneRegistry,
				labels: {
					splitDown: t("v2Workspace.context.splitHorizontal"),
					splitRight: t("v2Workspace.context.splitVertical"),
					equalize: t("v2Workspace.context.equalize"),
					moveToTab: t("v2Workspace.context.moveToTab"),
					newTab: t("v2Workspace.context.newTab"),
					closePane: t("v2Workspace.context.closePane"),
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
