import type { ExecutionMode } from "@superset/shared/desktop-types";

export interface PresetModeLabels {
	tabPerCommand: string;
	newTab: string;
	newTabPanes: string;
	allCurrentTab: string;
	currentTab: string;
	singleTabPanes: string;
	splitPane: string;
}

const DEFAULT_MODE_LABELS: PresetModeLabels = {
	tabPerCommand: "Tab per command",
	newTab: "New tab",
	newTabPanes: "New tab + panes",
	allCurrentTab: "All in current tab",
	currentTab: "Current tab",
	singleTabPanes: "Single tab + panes",
	splitPane: "Split pane",
};

export function getPresetModeLabel(
	modeValue: ExecutionMode,
	commandCount: number,
	labels: PresetModeLabels = DEFAULT_MODE_LABELS,
): string {
	const hasMultipleCommands = commandCount > 1;

	if (modeValue === "new-tab") {
		return hasMultipleCommands ? labels.tabPerCommand : labels.newTab;
	}

	if (modeValue === "new-tab-split-pane") {
		return hasMultipleCommands ? labels.newTabPanes : labels.newTab;
	}

	if (modeValue === "sequential") {
		return hasMultipleCommands ? labels.allCurrentTab : labels.currentTab;
	}

	return hasMultipleCommands ? labels.singleTabPanes : labels.splitPane;
}
