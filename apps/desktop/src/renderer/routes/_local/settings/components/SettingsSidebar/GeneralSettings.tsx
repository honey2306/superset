import { cn } from "@superset/ui/utils";
import { Link, useMatchRoute } from "@tanstack/react-router";
import {
	HiOutlineBell,
	HiOutlineCommandLine,
	HiOutlineFolder,
	HiOutlinePaintBrush,
	HiOutlineShieldCheck,
	HiOutlineSparkles,
} from "react-icons/hi2";
import { LuBrain, LuGitBranch, LuKeyboard, LuSmartphone } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type MessageKey,
	useTranslation,
} from "renderer/providers/I18nProvider";
import type { SettingsSection } from "renderer/stores/settings-state";
import { getAllowedSettingsSections } from "../../utils/settings-search";

interface GeneralSettingsProps {
	matchCounts: Partial<Record<SettingsSection, number>> | null;
}

type SettingsRoute =
	| "/settings/appearance"
	| "/settings/ringtones"
	| "/settings/keyboard"
	| "/settings/behavior"
	| "/settings/git"
	| "/settings/terminal"
	| "/settings/models"
	| "/settings/phone"
	| "/settings/permissions"
	| "/settings/projects";

interface SectionItem {
	id: SettingsRoute;
	section?: SettingsSection;
	labelKey: MessageKey;
	icon: React.ReactNode;
	macOnly?: boolean;
}

interface SectionGroup {
	labelKey: MessageKey;
	items: SectionItem[];
}

const SECTION_GROUPS: SectionGroup[] = [
	{
		labelKey: "settings.group.personal",
		items: [
			{
				id: "/settings/appearance",
				section: "appearance",
				labelKey: "settings.appearance",
				icon: <HiOutlinePaintBrush className="h-4 w-4" />,
			},
			{
				id: "/settings/ringtones",
				section: "ringtones",
				labelKey: "settings.notifications",
				icon: <HiOutlineBell className="h-4 w-4" />,
			},
		],
	},
	{
		labelKey: "settings.group.editorWorkflow",
		items: [
			{
				id: "/settings/behavior",
				section: "behavior",
				labelKey: "settings.general",
				icon: <HiOutlineSparkles className="h-4 w-4" />,
			},
			{
				id: "/settings/keyboard",
				section: "keyboard",
				labelKey: "settings.keyboard",
				icon: <LuKeyboard className="h-4 w-4" />,
			},
			{
				id: "/settings/git",
				section: "git",
				labelKey: "settings.gitWorktrees",
				icon: <LuGitBranch className="h-4 w-4" />,
			},
			{
				id: "/settings/terminal",
				section: "terminal",
				labelKey: "settings.terminal",
				icon: <HiOutlineCommandLine className="h-4 w-4" />,
			},
			{
				id: "/settings/models",
				section: "models",
				labelKey: "settings.models",
				icon: <LuBrain className="h-4 w-4" />,
			},
		],
	},
	{
		labelKey: "settings.group.organization",
		items: [
			{
				id: "/settings/projects",
				section: "project",
				labelKey: "settings.projects",
				icon: <HiOutlineFolder className="h-4 w-4" />,
			},
		],
	},
	{
		labelKey: "settings.group.system",
		items: [
			{
				id: "/settings/phone",
				labelKey: "settings.phoneAccess",
				icon: <LuSmartphone className="h-4 w-4" />,
			},
			{
				id: "/settings/permissions",
				section: "permissions",
				labelKey: "settings.permissions",
				icon: <HiOutlineShieldCheck className="h-4 w-4" />,
				macOnly: true,
			},
		],
	},
];

export function GeneralSettings({ matchCounts }: GeneralSettingsProps) {
	const { t } = useTranslation();
	const matchRoute = useMatchRoute();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === "darwin";
	const allowedSections = getAllowedSettingsSections();

	return (
		<>
			{SECTION_GROUPS.map((group, groupIndex) => {
				const platformItems = group.items.filter(
					(item) =>
						(!item.macOnly || isMac) &&
						(item.section === undefined || allowedSections.has(item.section)),
				);
				const filteredItems = matchCounts
					? platformItems.filter(
							(item) =>
								item.section !== undefined &&
								(matchCounts[item.section] ?? 0) > 0,
						)
					: platformItems;

				if (filteredItems.length === 0) return null;

				return (
					<div key={group.labelKey} className={cn(groupIndex > 0 && "mt-4")}>
						<h2 className="text-[10px] font-medium text-fg-faint uppercase tracking-[0.1em] px-3 mb-1">
							{t(group.labelKey)}
						</h2>
						<nav className="flex flex-col">
							{filteredItems.map((section) => {
								const isActive = !!matchRoute({
									to: section.id,
									fuzzy: true,
								});
								const count = section.section
									? matchCounts?.[section.section]
									: undefined;

								return (
									<Link
										key={section.id}
										to={section.id}
										className={cn(
											"flex items-center gap-3 px-3 py-1.5 text-sm rounded-ds-3 transition-colors text-left",
											isActive
												? "bg-accent-tint text-accent-foreground"
												: "text-fg-mute hover:bg-hover hover:text-accent-foreground",
										)}
									>
										{section.icon}
										<span className="flex-1">{t(section.labelKey)}</span>
										{count !== undefined && count > 0 && (
											<span className="text-xs text-fg-mute bg-accent-tint/50 px-1.5 py-0.5 rounded">
												{count}
											</span>
										)}
									</Link>
								);
							})}
						</nav>
					</div>
				);
			})}
		</>
	);
}
