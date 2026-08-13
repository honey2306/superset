import {
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@superset/ui/context-menu";
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
import type { Tab } from "renderer/stores/tabs/types";

export interface PaneContextMenuActions {
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onEqualizePaneSplits?: () => void;
	onClosePane: () => void;
	currentTabId: string;
	availableTabs: Tab[];
	onMoveToTab: (tabId: string) => void;
	onMoveToNewTab: () => void;
}

interface PaneContextMenuItemsProps {
	actions: PaneContextMenuActions;
	closeLabel: string;
}

export function PaneContextMenuItems({
	actions,
	closeLabel,
}: PaneContextMenuItemsProps) {
	const { t } = useTranslation();
	const splitDownShortcut = useHotkeyDisplay("SPLIT_DOWN").text;
	const splitRightShortcut = useHotkeyDisplay("SPLIT_RIGHT").text;
	const equalizePaneSplitsShortcut = useHotkeyDisplay(
		"EQUALIZE_PANE_SPLITS",
	).text;
	const targetTabs = actions.availableTabs.filter(
		(tab) => tab.id !== actions.currentTabId,
	);
	const renderShortcut = (shortcut: string) => {
		if (shortcut === "Unassigned") return null;
		return <ContextMenuShortcut>{shortcut}</ContextMenuShortcut>;
	};

	return (
		<>
			<ContextMenuItem onSelect={actions.onSplitHorizontal}>
				<LuRows2 className="size-4" />
				{t("workspace.context.splitHorizontal")}
				{renderShortcut(splitDownShortcut)}
			</ContextMenuItem>
			<ContextMenuItem onSelect={actions.onSplitVertical}>
				<LuColumns2 className="size-4" />
				{t("workspace.context.splitVertical")}
				{renderShortcut(splitRightShortcut)}
			</ContextMenuItem>
			{actions.onEqualizePaneSplits && (
				<ContextMenuItem onSelect={actions.onEqualizePaneSplits}>
					<LuEqual className="size-4" />
					{t("workspace.context.equalize")}
					{renderShortcut(equalizePaneSplitsShortcut)}
				</ContextMenuItem>
			)}
			<ContextMenuSeparator />
			<ContextMenuSub>
				<ContextMenuSubTrigger className="gap-2">
					<LuMoveRight className="size-4" />
					{t("workspace.context.moveToTab")}
				</ContextMenuSubTrigger>
				<ContextMenuSubContent>
					{targetTabs.map((tab) => (
						<ContextMenuItem
							key={tab.id}
							onSelect={() => actions.onMoveToTab(tab.id)}
						>
							{tab.name}
						</ContextMenuItem>
					))}
					{targetTabs.length > 0 && <ContextMenuSeparator />}
					<ContextMenuItem onSelect={actions.onMoveToNewTab}>
						<LuPlus className="size-4" />
						{t("workspace.context.newTab")}
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuSeparator />
			<ContextMenuItem variant="destructive" onSelect={actions.onClosePane}>
				<LuX className="size-4" />
				{closeLabel}
			</ContextMenuItem>
		</>
	);
}
