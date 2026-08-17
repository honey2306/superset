import {
	DEFAULT_LOCALE,
	type Locale,
	type MessageKey,
	messages,
} from "renderer/providers/I18nProvider/messages";
import type { SettingsSection } from "renderer/stores/settings-state";

export const SETTING_ITEM_ID = {
	APPEARANCE_THEME: "appearance-theme",
	APPEARANCE_MARKDOWN: "appearance-markdown",
	APPEARANCE_CUSTOM_THEMES: "appearance-custom-themes",
	APPEARANCE_EDITOR_FONT: "appearance-editor-font",
	APPEARANCE_TERMINAL_FONT: "appearance-terminal-font",

	RINGTONES_NOTIFICATION: "ringtones-notification",

	KEYBOARD_SHORTCUTS: "keyboard-shortcuts",
	BEHAVIOR_CONFIRM_QUIT: "behavior-confirm-quit",
	BEHAVIOR_DELEGATED_EXECUTION: "behavior-delegated-execution",
	BEHAVIOR_FILE_OPEN_MODE: "behavior-file-open-mode",
	BEHAVIOR_RESOURCE_MONITOR: "behavior-resource-monitor",

	GIT_BRANCH_PREFIX: "git-branch-prefix",
	GIT_DELETE_LOCAL_BRANCH: "git-delete-local-branch",
	GIT_WORKTREE_LOCATION: "git-worktree-location",

	TERMINAL_PRESETS: "terminal-presets",
	TERMINAL_QUICK_ADD: "terminal-quick-add",
	TERMINAL_SESSIONS: "terminal-sessions",
	TERMINAL_LINK_BEHAVIOR: "terminal-link-behavior",
	TERMINAL_BACKGROUND_LIMIT: "terminal-background-limit",
	TERMINAL_ACP_MODE: "terminal-acp-mode",

	MODELS_ANTHROPIC: "models-anthropic",
	MODELS_OPENAI: "models-openai",

	PROJECT_NAME: "project-name",
	PROJECT_PATH: "project-path",
	PROJECT_SCRIPTS: "project-scripts",
	PROJECT_BRANCH_PREFIX: "project-branch-prefix",
	PROJECT_WORKTREE_LOCATION: "project-worktree-location",
	PROJECT_IMPORT_WORKTREES: "project-import-worktrees",

	PERMISSIONS_FULL_DISK_ACCESS: "permissions-full-disk-access",
	PERMISSIONS_ACCESSIBILITY: "permissions-accessibility",
	PERMISSIONS_MICROPHONE: "permissions-microphone",
	PERMISSIONS_APPLE_EVENTS: "permissions-apple-events",
	PERMISSIONS_LOCAL_NETWORK: "permissions-local-network",
} as const;

export type SettingItemId =
	(typeof SETTING_ITEM_ID)[keyof typeof SETTING_ITEM_ID];

export interface SettingsItem {
	id: SettingItemId;
	section: SettingsSection;
	title: string;
	description: string;
	keywords: string[];
	localizedKeywords?: Partial<Record<Locale, string[]>>;
}

interface SettingsItemDefinition {
	id: SettingItemId;
	section: SettingsSection;
	titleKey: MessageKey;
	descriptionKey: MessageKey;
	keywords: string[];
	localizedKeywords?: Partial<Record<Locale, string[]>>;
}

const SETTINGS_ITEM_DEFINITIONS: SettingsItemDefinition[] = [
	{
		id: SETTING_ITEM_ID.APPEARANCE_THEME,
		titleKey: "settingsSearch.appearance_theme.title",
		descriptionKey: "settingsSearch.appearance_theme.description",
		section: "appearance",
		localizedKeywords: { "zh-CN": ["外观", "主题", "字体", "样式"] },
		keywords: [
			"appearance",
			"theme",
			"dark",
			"light",
			"dark mode",
			"light mode",
			"colors",
			"night",
			"system",
			"visual",
		],
	},
	{
		id: SETTING_ITEM_ID.APPEARANCE_MARKDOWN,
		titleKey: "settingsSearch.appearance_markdown.title",
		descriptionKey: "settingsSearch.appearance_markdown.description",
		section: "appearance",
		localizedKeywords: { "zh-CN": ["外观", "主题", "字体", "样式"] },
		keywords: [
			"appearance",
			"markdown",
			"style",
			"tufte",
			"rendering",
			"preview",
			"format",
			"display",
			"md",
			"readme",
		],
	},
	{
		id: SETTING_ITEM_ID.APPEARANCE_CUSTOM_THEMES,
		titleKey: "settingsSearch.appearance_custom_themes.title",
		descriptionKey: "settingsSearch.appearance_custom_themes.description",
		section: "appearance",
		localizedKeywords: { "zh-CN": ["外观", "主题", "字体", "样式"] },
		keywords: [
			"appearance",
			"custom",
			"themes",
			"import",
			"json",
			"color scheme",
			"upload",
			"personalize",
			"customize",
		],
	},
	{
		id: SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT,
		titleKey: "settingsSearch.appearance_editor_font.title",
		descriptionKey: "settingsSearch.appearance_editor_font.description",
		section: "appearance",
		localizedKeywords: { "zh-CN": ["外观", "主题", "字体", "样式"] },
		keywords: [
			"appearance",
			"font",
			"family",
			"size",
			"editor",
			"diff",
			"mono",
			"monospace",
			"typography",
			"custom",
		],
	},
	{
		id: SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT,
		titleKey: "settingsSearch.appearance_terminal_font.title",
		descriptionKey: "settingsSearch.appearance_terminal_font.description",
		section: "appearance",
		localizedKeywords: { "zh-CN": ["外观", "主题", "字体", "样式"] },
		keywords: [
			"appearance",
			"font",
			"family",
			"size",
			"terminal",
			"mono",
			"monospace",
			"typography",
			"custom",
			"nerd",
		],
	},
	{
		id: SETTING_ITEM_ID.RINGTONES_NOTIFICATION,
		titleKey: "settingsSearch.ringtones_notification.title",
		descriptionKey: "settingsSearch.ringtones_notification.description",
		section: "ringtones",
		localizedKeywords: { "zh-CN": ["通知", "声音", "铃声"] },
		keywords: [
			"notifications",
			"notification",
			"sound",
			"ringtone",
			"audio",
			"alert",
			"bell",
			"tone",
			"complete",
			"done",
			"finished",
			"chime",
			"mute",
			"volume",
		],
	},
	{
		id: SETTING_ITEM_ID.KEYBOARD_SHORTCUTS,
		titleKey: "settingsSearch.keyboard_shortcuts.title",
		descriptionKey: "settingsSearch.keyboard_shortcuts.description",
		section: "keyboard",
		localizedKeywords: { "zh-CN": ["键盘", "快捷键"] },
		keywords: [
			"keyboard",
			"shortcuts",
			"hotkeys",
			"keys",
			"bindings",
			"keybindings",
			"commands",
			"ctrl",
			"cmd",
			"alt",
			"customize",
		],
	},
	{
		id: SETTING_ITEM_ID.BEHAVIOR_CONFIRM_QUIT,
		titleKey: "settingsSearch.behavior_confirm_quit.title",
		descriptionKey: "settingsSearch.behavior_confirm_quit.description",
		section: "behavior",
		localizedKeywords: { "zh-CN": ["行为", "文件", "退出", "资源"] },
		keywords: [
			"features",
			"confirm",
			"quit",
			"quitting",
			"exit",
			"close",
			"dialog",
			"warning",
			"prompt",
			"unsaved",
		],
	},
	{
		id: SETTING_ITEM_ID.BEHAVIOR_DELEGATED_EXECUTION,
		titleKey: "settingsSearch.behavior_delegated_execution.title",
		descriptionKey: "settingsSearch.behavior_delegated_execution.description",
		section: "behavior",
		localizedKeywords: {
			"zh-CN": ["委派", "执行", "子智能体", "智能体", "模型"],
		},
		keywords: [
			"delegated execution",
			"delegate",
			"executor",
			"subagent",
			"agent",
			"model",
			"orchestrator",
		],
	},
	{
		id: SETTING_ITEM_ID.GIT_DELETE_LOCAL_BRANCH,
		titleKey: "settingsSearch.git_delete_local_branch.title",
		descriptionKey: "settingsSearch.git_delete_local_branch.description",
		section: "git",
		localizedKeywords: { "zh-CN": ["Git", "分支", "工作树"] },
		keywords: [
			"git",
			"delete",
			"branch",
			"local",
			"worktree",
			"workspace",
			"remove",
			"cleanup",
		],
	},
	{
		id: SETTING_ITEM_ID.GIT_BRANCH_PREFIX,
		titleKey: "settingsSearch.git_branch_prefix.title",
		descriptionKey: "settingsSearch.git_branch_prefix.description",
		section: "git",
		localizedKeywords: { "zh-CN": ["Git", "分支", "工作树"] },
		keywords: [
			"git",
			"branch",
			"prefix",
			"naming",
			"worktree",
			"author",
			"github",
			"username",
			"feat",
			"custom",
		],
	},
	{
		id: SETTING_ITEM_ID.BEHAVIOR_FILE_OPEN_MODE,
		titleKey: "settingsSearch.behavior_file_open_mode.title",
		descriptionKey: "settingsSearch.behavior_file_open_mode.description",
		section: "behavior",
		localizedKeywords: { "zh-CN": ["行为", "文件", "退出", "资源"] },
		keywords: [
			"file",
			"open",
			"mode",
			"split",
			"pane",
			"tab",
			"new tab",
			"split pane",
			"viewer",
			"behavior",
		],
	},
	{
		id: SETTING_ITEM_ID.BEHAVIOR_RESOURCE_MONITOR,
		titleKey: "settingsSearch.behavior_resource_monitor.title",
		descriptionKey: "settingsSearch.behavior_resource_monitor.description",
		section: "behavior",
		localizedKeywords: { "zh-CN": ["行为", "文件", "退出", "资源"] },
		keywords: [
			"features",
			"resource",
			"monitor",
			"cpu",
			"memory",
			"ram",
			"usage",
			"performance",
			"process",
			"terminal",
		],
	},
	{
		id: SETTING_ITEM_ID.GIT_WORKTREE_LOCATION,
		titleKey: "settingsSearch.git_worktree_location.title",
		descriptionKey: "settingsSearch.git_worktree_location.description",
		section: "git",
		localizedKeywords: { "zh-CN": ["Git", "分支", "工作树"] },
		keywords: [
			"git",
			"worktree",
			"location",
			"directory",
			"path",
			"folder",
			"storage",
			"base",
			"default",
		],
	},
	{
		id: SETTING_ITEM_ID.TERMINAL_PRESETS,
		titleKey: "settingsSearch.terminal_presets.title",
		descriptionKey: "settingsSearch.terminal_presets.description",
		section: "terminal",
		localizedKeywords: { "zh-CN": ["终端", "预设", "会话"] },
		keywords: [
			"terminal",
			"preset",
			"presets",
			"commands",
			"agent",
			"launch",
			"default",
			"startup",
			"config",
			"shell",
			"run",
		],
	},
	{
		id: SETTING_ITEM_ID.TERMINAL_QUICK_ADD,
		titleKey: "settingsSearch.terminal_quick_add.title",
		descriptionKey: "settingsSearch.terminal_quick_add.description",
		section: "terminal",
		localizedKeywords: { "zh-CN": ["终端", "预设", "会话"] },
		keywords: [
			"terminal",
			"quick",
			"add",
			"template",
			"claude",
			"codex",
			"gemini",
			"cursor",
			"opencode",
			"pi",
			"ai",
			"assistant",
			"vibe",
			"mistral",
			"kimi",
			"moonshot",
		],
	},
	{
		id: SETTING_ITEM_ID.TERMINAL_SESSIONS,
		titleKey: "settingsSearch.terminal_sessions.title",
		descriptionKey: "settingsSearch.terminal_sessions.description",
		section: "terminal",
		localizedKeywords: { "zh-CN": ["终端", "预设", "会话"] },
		keywords: [
			"terminal",
			"daemon",
			"pty daemon",
			"supervisor",
			"restart daemon",
			"update daemon",
			"background",
			"sessions",
			"active",
			"running",
			"kill",
			"terminate",
			"process",
			"stop",
			"manage",
			"pty",
		],
	},
	{
		id: SETTING_ITEM_ID.TERMINAL_BACKGROUND_LIMIT,
		titleKey: "settingsSearch.terminal_background_limit.title",
		descriptionKey: "settingsSearch.terminal_background_limit.description",
		section: "terminal",
		localizedKeywords: { "zh-CN": ["终端", "预设", "会话"] },
		keywords: [
			"terminal",
			"memory",
			"background",
			"hidden",
			"parked",
			"limit",
			"cap",
			"performance",
			"ram",
			"scrollback",
		],
	},
	{
		id: SETTING_ITEM_ID.TERMINAL_LINK_BEHAVIOR,
		titleKey: "settingsSearch.terminal_link_behavior.title",
		descriptionKey: "settingsSearch.terminal_link_behavior.description",
		section: "terminal",
		localizedKeywords: { "zh-CN": ["终端", "预设", "会话"] },
		keywords: [
			"terminal",
			"link",
			"click",
			"open",
			"external",
			"editor",
			"file",
			"url",
			"path",
			"cmd",
			"ctrl",
			"browser",
		],
	},
	{
		id: SETTING_ITEM_ID.TERMINAL_ACP_MODE,
		titleKey: "settingsSearch.terminal_acp_mode.title",
		descriptionKey: "settingsSearch.terminal_acp_mode.description",
		section: "terminal",
		localizedKeywords: { "zh-CN": ["ACP", "代理", "预设", "协议", "会话"] },
		keywords: [
			"acp",
			"agent",
			"preset",
			"presets",
			"protocol",
			"session",
			"mode",
			"claude",
			"codex",
			"pi",
			"myflicker",
			"launcher",
		],
	},
	{
		id: SETTING_ITEM_ID.MODELS_ANTHROPIC,
		titleKey: "settingsSearch.models_anthropic.title",
		descriptionKey: "settingsSearch.models_anthropic.description",
		section: "models",
		localizedKeywords: { "zh-CN": ["模型", "认证", "连接"] },
		keywords: [
			"models",
			"anthropic",
			"claude",
			"oauth",
			"api key",
			"auth",
			"workspace naming",
			"auto name",
		],
	},
	{
		id: SETTING_ITEM_ID.MODELS_OPENAI,
		titleKey: "settingsSearch.models_openai.title",
		descriptionKey: "settingsSearch.models_openai.description",
		section: "models",
		localizedKeywords: { "zh-CN": ["模型", "认证", "连接"] },
		keywords: [
			"models",
			"openai",
			"gpt",
			"oauth",
			"api key",
			"auth",
			"workspace naming",
			"auto name",
		],
	},
	{
		id: SETTING_ITEM_ID.PROJECT_NAME,
		titleKey: "settingsSearch.project_name.title",
		descriptionKey: "settingsSearch.project_name.description",
		section: "project",
		localizedKeywords: { "zh-CN": ["项目", "仓库", "脚本", "工作树"] },
		keywords: ["project", "name", "rename", "title", "label"],
	},
	{
		id: SETTING_ITEM_ID.PROJECT_PATH,
		titleKey: "settingsSearch.project_path.title",
		descriptionKey: "settingsSearch.project_path.description",
		section: "project",
		localizedKeywords: { "zh-CN": ["项目", "仓库", "脚本", "工作树"] },
		keywords: [
			"project",
			"path",
			"repository",
			"folder",
			"directory",
			"location",
			"git",
			"repo",
			"root",
		],
	},
	{
		id: SETTING_ITEM_ID.PROJECT_SCRIPTS,
		titleKey: "settingsSearch.project_scripts.title",
		descriptionKey: "settingsSearch.project_scripts.description",
		section: "project",
		localizedKeywords: { "zh-CN": ["项目", "仓库", "脚本", "工作树"] },
		keywords: [
			"project",
			"scripts",
			"setup",
			"teardown",
			"run",
			"bash",
			"shell",
			"automation",
			"hooks",
			"init",
			"initialize",
			"cleanup",
			"onboarding",
			"config",
		],
	},
	{
		id: SETTING_ITEM_ID.PROJECT_BRANCH_PREFIX,
		titleKey: "settingsSearch.project_branch_prefix.title",
		descriptionKey: "settingsSearch.project_branch_prefix.description",
		section: "project",
		localizedKeywords: { "zh-CN": ["项目", "仓库", "脚本", "工作树"] },
		keywords: [
			"project",
			"branch",
			"prefix",
			"naming",
			"git",
			"worktree",
			"author",
			"github",
			"username",
			"feat",
			"custom",
			"override",
		],
	},
	{
		id: SETTING_ITEM_ID.PROJECT_WORKTREE_LOCATION,
		titleKey: "settingsSearch.project_worktree_location.title",
		descriptionKey: "settingsSearch.project_worktree_location.description",
		section: "project",
		localizedKeywords: { "zh-CN": ["项目", "仓库", "脚本", "工作树"] },
		keywords: [
			"project",
			"worktree",
			"location",
			"directory",
			"path",
			"folder",
			"storage",
			"override",
		],
	},
	{
		id: SETTING_ITEM_ID.PROJECT_IMPORT_WORKTREES,
		titleKey: "settingsSearch.project_import_worktrees.title",
		descriptionKey: "settingsSearch.project_import_worktrees.description",
		section: "project",
		localizedKeywords: { "zh-CN": ["项目", "仓库", "脚本", "工作树"] },
		keywords: [
			"project",
			"import",
			"worktree",
			"worktrees",
			"workspace",
			"workspaces",
			"external",
			"existing",
			"disk",
			"add",
		],
	},
	{
		id: SETTING_ITEM_ID.PERMISSIONS_FULL_DISK_ACCESS,
		titleKey: "settingsSearch.permissions_full_disk_access.title",
		descriptionKey: "settingsSearch.permissions_full_disk_access.description",
		section: "permissions",
		localizedKeywords: { "zh-CN": ["权限", "隐私", "系统"] },
		keywords: [
			"permissions",
			"full disk access",
			"fda",
			"files",
			"documents",
			"downloads",
			"desktop",
			"icloud",
			"macos",
			"security",
			"privacy",
		],
	},
	{
		id: SETTING_ITEM_ID.PERMISSIONS_ACCESSIBILITY,
		titleKey: "settingsSearch.permissions_accessibility.title",
		descriptionKey: "settingsSearch.permissions_accessibility.description",
		section: "permissions",
		localizedKeywords: { "zh-CN": ["权限", "隐私", "系统"] },
		keywords: [
			"permissions",
			"accessibility",
			"a11y",
			"keystrokes",
			"window management",
			"macos",
			"security",
			"privacy",
			"trusted",
		],
	},
	{
		id: SETTING_ITEM_ID.PERMISSIONS_MICROPHONE,
		titleKey: "settingsSearch.permissions_microphone.title",
		descriptionKey: "settingsSearch.permissions_microphone.description",
		section: "permissions",
		localizedKeywords: { "zh-CN": ["权限", "隐私", "系统"] },
		keywords: [
			"permissions",
			"microphone",
			"mic",
			"voice",
			"transcription",
			"audio",
			"recording",
			"push to talk",
			"codex",
			"privacy",
		],
	},
	{
		id: SETTING_ITEM_ID.PERMISSIONS_APPLE_EVENTS,
		titleKey: "settingsSearch.permissions_apple_events.title",
		descriptionKey: "settingsSearch.permissions_apple_events.description",
		section: "permissions",
		localizedKeywords: { "zh-CN": ["权限", "隐私", "系统"] },
		keywords: [
			"permissions",
			"automation",
			"apple events",
			"applescript",
			"macos",
			"security",
			"privacy",
			"system events",
		],
	},
	{
		id: SETTING_ITEM_ID.PERMISSIONS_LOCAL_NETWORK,
		titleKey: "settingsSearch.permissions_local_network.title",
		descriptionKey: "settingsSearch.permissions_local_network.description",
		section: "permissions",
		localizedKeywords: { "zh-CN": ["权限", "隐私", "系统"] },
		keywords: [
			"permissions",
			"local network",
			"bonjour",
			"mdns",
			"macos",
			"security",
			"privacy",
			"development servers",
		],
	},
];

export function getSettingsItems(
	locale: Locale = DEFAULT_LOCALE,
): SettingsItem[] {
	return SETTINGS_ITEM_DEFINITIONS.map((item) => ({
		id: item.id,
		section: item.section,
		title: messages[locale][item.titleKey],
		description: messages[locale][item.descriptionKey],
		keywords: [...item.keywords, ...(item.localizedKeywords?.[locale] ?? [])],
	}));
}

export const SETTINGS_ITEMS = getSettingsItems();

export function searchSettings(
	query: string,
	locale: Locale = DEFAULT_LOCALE,
): SettingsItem[] {
	const items = getSettingsItems(locale);
	if (!query.trim()) return items;

	const q = query.toLowerCase();
	return items.filter(
		(item) =>
			item.title.toLowerCase().includes(q) ||
			item.description.toLowerCase().includes(q) ||
			item.keywords.some((kw) => kw.toLowerCase().includes(q)),
	);
}

export function getMatchCountBySection(
	query: string,
	locale: Locale = DEFAULT_LOCALE,
): Partial<Record<SettingsSection, number>> {
	const matches = searchSettings(query, locale);
	const counts: Partial<Record<SettingsSection, number>> = {};

	for (const item of matches) {
		counts[item.section] = (counts[item.section] || 0) + 1;
	}

	return counts;
}

export function getMatchingItemsForSection(
	query: string,
	section: SettingsSection,
	locale: Locale = DEFAULT_LOCALE,
): SettingsItem[] {
	return searchSettings(query, locale).filter(
		(item) => item.section === section,
	);
}

export function isItemVisible(
	itemId: SettingItemId,
	visibleItems: SettingItemId[] | null | undefined,
): boolean {
	return !visibleItems || visibleItems.includes(itemId);
}

/**
 * Items in `section` that match the query, or every item when no query is provided.
 */
export function getVisibleItemsForSection(params: {
	section: SettingsSection;
	searchQuery: string;
	locale?: Locale;
}): SettingItemId[] {
	const { section, searchQuery, locale = DEFAULT_LOCALE } = params;
	const matched = searchQuery.trim()
		? getMatchingItemsForSection(searchQuery, section, locale)
		: SETTINGS_ITEMS.filter((item) => item.section === section);
	return matched.map((item) => item.id);
}

export function getVisibleMatchCountBySection(
	query: string,
	locale: Locale = DEFAULT_LOCALE,
): Partial<Record<SettingsSection, number>> {
	return getMatchCountBySection(query, locale);
}

export function getAllowedSettingsSections(): Set<SettingsSection> {
	return new Set(SETTINGS_ITEMS.map((item) => item.section));
}
