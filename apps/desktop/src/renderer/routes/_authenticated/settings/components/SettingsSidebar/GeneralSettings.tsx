import { cn } from "@superset/ui/utils";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
	HiOutlineBeaker,
	HiOutlineBell,
	HiOutlineCommandLine,
	HiOutlineComputerDesktop,
	HiOutlineCpuChip,
	HiOutlineFolder,
	HiOutlineKey,
	HiOutlineLink,
	HiOutlineLockClosed,
	HiOutlinePaintBrush,
	HiOutlinePuzzlePiece,
	HiOutlineShieldCheck,
	HiOutlineSparkles,
	HiOutlineUser,
} from "react-icons/hi2";
import { LuBrain, LuGitBranch, LuKeyboard } from "react-icons/lu";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type MessageKey,
	useTranslation,
} from "renderer/providers/I18nProvider";
import type { SettingsSection } from "renderer/stores/settings-state";
import { getAllowedSectionsForVariant } from "../../utils/settings-search";

interface GeneralSettingsProps {
	matchCounts: Partial<Record<SettingsSection, number>> | null;
}

type SettingsRoute =
	| "/settings/account"
	| "/settings/appearance"
	| "/settings/ringtones"
	| "/settings/keyboard"
	| "/settings/behavior"
	| "/settings/git"
	| "/settings/agents"
	| "/settings/terminal"
	| "/settings/links"
	| "/settings/models"
	| "/settings/experimental"
	| "/settings/integrations"
	| "/settings/api-keys"
	| "/settings/security"
	| "/settings/permissions"
	| "/settings/projects"
	| "/settings/hosts";

interface SectionItem {
	id: SettingsRoute;
	section: SettingsSection;
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
				id: "/settings/account",
				section: "account",
				labelKey: "settings.account",
				icon: <HiOutlineUser className="h-4 w-4" />,
			},
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
				id: "/settings/agents",
				section: "agents",
				labelKey: "settings.agents",
				icon: <HiOutlineCpuChip className="h-4 w-4" />,
			},
			{
				id: "/settings/terminal",
				section: "terminal",
				labelKey: "settings.terminal",
				icon: <HiOutlineCommandLine className="h-4 w-4" />,
			},
			{
				id: "/settings/links",
				section: "links",
				labelKey: "settings.links",
				icon: <HiOutlineLink className="h-4 w-4" />,
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
			{
				id: "/settings/hosts",
				section: "hosts",
				labelKey: "settings.hosts",
				icon: <HiOutlineComputerDesktop className="h-4 w-4" />,
			},
			{
				id: "/settings/integrations",
				section: "integrations",
				labelKey: "settings.integrations",
				icon: <HiOutlinePuzzlePiece className="h-4 w-4" />,
			},
			{
				id: "/settings/api-keys",
				section: "apikeys",
				labelKey: "settings.apiKeys",
				icon: <HiOutlineKey className="h-4 w-4" />,
			},
		],
	},
	{
		labelKey: "settings.group.system",
		items: [
			{
				id: "/settings/security",
				section: "security",
				labelKey: "settings.security",
				icon: <HiOutlineLockClosed className="h-4 w-4" />,
			},
			{
				id: "/settings/permissions",
				section: "permissions",
				labelKey: "settings.permissions",
				icon: <HiOutlineShieldCheck className="h-4 w-4" />,
				macOnly: true,
			},
			{
				id: "/settings/experimental",
				section: "experimental",
				labelKey: "settings.experimental",
				icon: <HiOutlineBeaker className="h-4 w-4" />,
			},
		],
	},
];

export function GeneralSettings({ matchCounts }: GeneralSettingsProps) {
	const { t } = useTranslation();
	const matchRoute = useMatchRoute();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === "darwin";
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const allowedSections = useMemo(
		() => getAllowedSectionsForVariant(isV2CloudEnabled),
		[isV2CloudEnabled],
	);

	return (
		<>
			{SECTION_GROUPS.map((group, groupIndex) => {
				const platformItems = group.items.filter(
					(item) =>
						(!item.macOnly || isMac) && allowedSections.has(item.section),
				);
				const filteredItems = matchCounts
					? platformItems.filter((item) => (matchCounts[item.section] ?? 0) > 0)
					: platformItems;

				if (filteredItems.length === 0) return null;

				return (
					<div key={group.labelKey} className={cn(groupIndex > 0 && "mt-4")}>
						<h2 className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-[0.1em] px-3 mb-1">
							{t(group.labelKey)}
						</h2>
						<nav className="flex flex-col">
							{filteredItems.map((section) => {
								const isActive = !!matchRoute({
									to: section.id,
									fuzzy: true,
								});
								const count = matchCounts?.[section.section];

								return (
									<Link
										key={section.id}
										to={section.id}
										className={cn(
											"flex items-center gap-3 px-3 py-1.5 text-sm rounded-md transition-colors text-left",
											isActive
												? "bg-accent text-accent-foreground"
												: "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
										)}
									>
										{section.icon}
										<span className="flex-1">{t(section.labelKey)}</span>
										{count !== undefined && count > 0 && (
											<span className="text-xs text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded">
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
