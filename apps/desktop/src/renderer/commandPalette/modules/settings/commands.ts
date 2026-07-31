import {
	BellIcon,
	CpuIcon,
	FileTextIcon,
	FolderIcon,
	GitBranchIcon,
	KeyboardIcon,
	type LucideIcon,
	PaletteIcon,
	ShieldIcon,
	SlidersIcon,
	TerminalIcon,
} from "lucide-react";
import type { Command } from "../../core/types";

interface SettingsTab {
	id: string;
	title: string;
	path: string;
	icon: LucideIcon;
	keywords?: string[];
}

const TABS: SettingsTab[] = [
	{
		id: "appearance",
		title: "Appearance",
		path: "/settings/appearance",
		icon: PaletteIcon,
		keywords: ["theme", "color"],
	},
	{
		id: "behavior",
		title: "Behavior",
		path: "/settings/behavior",
		icon: SlidersIcon,
	},
	{
		id: "models",
		title: "Models",
		path: "/settings/models",
		icon: CpuIcon,
		keywords: ["ai", "llm"],
	},
	{
		id: "terminal",
		title: "Terminal",
		path: "/settings/terminal",
		icon: TerminalIcon,
	},
	{ id: "git", title: "Git", path: "/settings/git", icon: GitBranchIcon },
	// Organization, Teams, and Billing removed for single-user setup
	{
		id: "keyboard",
		title: "Keyboard shortcuts",
		path: "/settings/keyboard",
		icon: KeyboardIcon,
		keywords: ["hotkeys", "shortcuts"],
	},
	{
		id: "permissions",
		title: "Permissions",
		path: "/settings/permissions",
		icon: ShieldIcon,
	},
	{
		id: "projects",
		title: "Projects",
		path: "/settings/projects",
		icon: FolderIcon,
	},
	{
		id: "ringtones",
		title: "Ringtones",
		path: "/settings/ringtones",
		icon: BellIcon,
	},
	// Billing removed for single-user setup
	{
		id: "presets",
		title: "Presets",
		path: "/settings/presets",
		icon: FileTextIcon,
	},
];

function tabToCommand(tab: SettingsTab): Command {
	return {
		id: `settings.${tab.id}`,
		title: tab.title,
		section: "navigation",
		icon: tab.icon,
		keywords: tab.keywords,
		run: (ctx) => ctx.navigate(tab.path),
	};
}

export const settingsTabCommands = TABS.map(tabToCommand);
