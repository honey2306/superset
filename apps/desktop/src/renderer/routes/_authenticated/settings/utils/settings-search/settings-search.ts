import {
	DEFAULT_LOCALE,
	type Locale,
	type MessageKey,
	messages,
} from "renderer/providers/I18nProvider/messages";
import type { SettingsSection } from "renderer/stores/settings-state";

export const SETTING_ITEM_ID = {
	ACCOUNT_PROFILE: "account-profile",
	ACCOUNT_SIGNOUT: "account-signout",

	ORGANIZATION_LOGO: "organization-logo",
	ORGANIZATION_NAME: "organization-name",
	ORGANIZATION_SLUG: "organization-slug",
	ORGANIZATION_ID: "organization-id",
	ORGANIZATION_MEMBERS_LIST: "organization-members-list",
	ORGANIZATION_MEMBERS_INVITE: "organization-members-invite",
	ORGANIZATION_MEMBERS_PENDING_INVITATIONS:
		"organization-members-pending-invitations",

	TEAMS_LIST: "teams-list",

	APPEARANCE_THEME: "appearance-theme",
	APPEARANCE_MARKDOWN: "appearance-markdown",
	APPEARANCE_CUSTOM_THEMES: "appearance-custom-themes",
	APPEARANCE_EDITOR_FONT: "appearance-editor-font",
	APPEARANCE_TERMINAL_FONT: "appearance-terminal-font",

	RINGTONES_NOTIFICATION: "ringtones-notification",

	KEYBOARD_SHORTCUTS: "keyboard-shortcuts",
	BEHAVIOR_CONFIRM_QUIT: "behavior-confirm-quit",
	BEHAVIOR_FILE_OPEN_MODE: "behavior-file-open-mode",
	BEHAVIOR_RESOURCE_MONITOR: "behavior-resource-monitor",
	BEHAVIOR_OPEN_LINKS_IN_APP: "behavior-open-links-in-app",

	GIT_BRANCH_PREFIX: "git-branch-prefix",
	GIT_DELETE_LOCAL_BRANCH: "git-delete-local-branch",
	GIT_WORKTREE_LOCATION: "git-worktree-location",

	AGENTS_ENABLED: "agents-enabled",
	AGENTS_COMMANDS: "agents-commands",
	AGENTS_TASK_PROMPTS: "agents-task-prompts",

	TERMINAL_PRESETS: "terminal-presets",
	TERMINAL_QUICK_ADD: "terminal-quick-add",
	TERMINAL_SESSIONS: "terminal-sessions",
	TERMINAL_LINK_BEHAVIOR: "terminal-link-behavior",
	TERMINAL_BACKGROUND_LIMIT: "terminal-background-limit",

	LINKS_FILE: "links-file",
	LINKS_URL: "links-url",
	LINKS_SIDEBAR_FILE: "links-sidebar-file",
	LINKS_PORT: "links-port",

	MODELS_ANTHROPIC: "models-anthropic",
	MODELS_OPENAI: "models-openai",

	EXPERIMENTAL_SUPERSET_V2: "experimental-superset-v2",
	EXPERIMENTAL_V1_MIGRATION: "experimental-v1-migration",
	EXPERIMENTAL_INLINE_WORKSPACE_PORTS: "experimental-inline-workspace-ports",
	EXPERIMENTAL_WORKSPACE_AGENTS: "experimental-workspace-agents",

	INTEGRATIONS_LINEAR: "integrations-linear",
	INTEGRATIONS_GITHUB: "integrations-github",
	INTEGRATIONS_SLACK: "integrations-slack",

	BILLING_OVERVIEW: "billing-overview",
	BILLING_PLANS: "billing-plans",
	BILLING_USAGE: "billing-usage",

	PROJECT_NAME: "project-name",
	PROJECT_PATH: "project-path",
	PROJECT_SCRIPTS: "project-scripts",
	PROJECT_BRANCH_PREFIX: "project-branch-prefix",
	PROJECT_WORKTREE_LOCATION: "project-worktree-location",
	PROJECT_IMPORT_WORKTREES: "project-import-worktrees",
	PROJECT_ENV_VARS: "project-env-vars",

	API_KEYS_LIST: "api-keys-list",
	API_KEYS_GENERATE: "api-keys-generate",

	PERMISSIONS_FULL_DISK_ACCESS: "permissions-full-disk-access",
	PERMISSIONS_ACCESSIBILITY: "permissions-accessibility",
	PERMISSIONS_MICROPHONE: "permissions-microphone",
	PERMISSIONS_APPLE_EVENTS: "permissions-apple-events",
	PERMISSIONS_LOCAL_NETWORK: "permissions-local-network",

	SECURITY_EXPOSE_HOST_SERVICE_VIA_RELAY:
		"security-expose-host-service-via-relay",

	HOST_MEMBERS: "host-members",
	HOST_INVITE_MEMBER: "host-invite-member",
	HOST_MEMBER_ROLE: "host-member-role",
	HOST_WORKTREE_LOCATION: "host-worktree-location",
	HOST_DELETE: "host-delete",
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

/**
 * Which v1/v2 variant of the desktop UI a setting applies to.
 * - "v1": only used by the legacy desktop UI; hide when the user is on v2.
 * - "v2": only meaningful in the v2 desktop UI; hide when the user is on v1.
 * - "shared": applies to both (or is provided by a global/cloud surface).
 *
 * Source of truth for the v1/v2 settings audit. When adding a new setting,
 * pick a variant or it will fail typecheck on the registry below.
 */
export type SettingVariant = "v1" | "v2" | "shared";

export const SETTING_ITEM_VARIANT: Record<SettingItemId, SettingVariant> = {
	[SETTING_ITEM_ID.ACCOUNT_PROFILE]: "shared",
	[SETTING_ITEM_ID.ACCOUNT_SIGNOUT]: "shared",

	[SETTING_ITEM_ID.ORGANIZATION_LOGO]: "shared",
	[SETTING_ITEM_ID.ORGANIZATION_NAME]: "shared",
	[SETTING_ITEM_ID.ORGANIZATION_SLUG]: "shared",
	[SETTING_ITEM_ID.ORGANIZATION_ID]: "shared",
	[SETTING_ITEM_ID.ORGANIZATION_MEMBERS_LIST]: "shared",
	[SETTING_ITEM_ID.ORGANIZATION_MEMBERS_INVITE]: "shared",
	[SETTING_ITEM_ID.ORGANIZATION_MEMBERS_PENDING_INVITATIONS]: "shared",

	[SETTING_ITEM_ID.TEAMS_LIST]: "shared",

	[SETTING_ITEM_ID.APPEARANCE_THEME]: "shared",
	[SETTING_ITEM_ID.APPEARANCE_MARKDOWN]: "shared",
	[SETTING_ITEM_ID.APPEARANCE_CUSTOM_THEMES]: "shared",
	[SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT]: "shared",
	[SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT]: "shared",

	[SETTING_ITEM_ID.RINGTONES_NOTIFICATION]: "shared",

	[SETTING_ITEM_ID.KEYBOARD_SHORTCUTS]: "shared",

	[SETTING_ITEM_ID.BEHAVIOR_CONFIRM_QUIT]: "shared",
	[SETTING_ITEM_ID.BEHAVIOR_FILE_OPEN_MODE]: "v1",
	[SETTING_ITEM_ID.BEHAVIOR_RESOURCE_MONITOR]: "shared",
	[SETTING_ITEM_ID.BEHAVIOR_OPEN_LINKS_IN_APP]: "v1",

	// Branch prefix exists in both UIs — v1 `GitSettings`, v2 `V2GitSettings`.
	[SETTING_ITEM_ID.GIT_BRANCH_PREFIX]: "shared",
	[SETTING_ITEM_ID.GIT_DELETE_LOCAL_BRANCH]: "v1",
	[SETTING_ITEM_ID.GIT_WORKTREE_LOCATION]: "shared",

	[SETTING_ITEM_ID.AGENTS_ENABLED]: "shared",
	[SETTING_ITEM_ID.AGENTS_COMMANDS]: "shared",
	[SETTING_ITEM_ID.AGENTS_TASK_PROMPTS]: "shared",

	[SETTING_ITEM_ID.TERMINAL_PRESETS]: "shared",
	[SETTING_ITEM_ID.TERMINAL_QUICK_ADD]: "shared",
	[SETTING_ITEM_ID.TERMINAL_SESSIONS]: "shared",
	[SETTING_ITEM_ID.TERMINAL_LINK_BEHAVIOR]: "v1",
	[SETTING_ITEM_ID.TERMINAL_BACKGROUND_LIMIT]: "v2",

	[SETTING_ITEM_ID.LINKS_FILE]: "v2",
	[SETTING_ITEM_ID.LINKS_URL]: "v2",
	[SETTING_ITEM_ID.LINKS_SIDEBAR_FILE]: "v2",
	[SETTING_ITEM_ID.LINKS_PORT]: "v2",

	[SETTING_ITEM_ID.MODELS_ANTHROPIC]: "shared",
	[SETTING_ITEM_ID.MODELS_OPENAI]: "shared",

	[SETTING_ITEM_ID.EXPERIMENTAL_SUPERSET_V2]: "shared",
	[SETTING_ITEM_ID.EXPERIMENTAL_V1_MIGRATION]: "v2",
	[SETTING_ITEM_ID.EXPERIMENTAL_INLINE_WORKSPACE_PORTS]: "v2",
	[SETTING_ITEM_ID.EXPERIMENTAL_WORKSPACE_AGENTS]: "v2",

	[SETTING_ITEM_ID.INTEGRATIONS_LINEAR]: "shared",
	[SETTING_ITEM_ID.INTEGRATIONS_GITHUB]: "shared",
	[SETTING_ITEM_ID.INTEGRATIONS_SLACK]: "shared",

	[SETTING_ITEM_ID.BILLING_OVERVIEW]: "shared",
	[SETTING_ITEM_ID.BILLING_PLANS]: "shared",
	[SETTING_ITEM_ID.BILLING_USAGE]: "shared",

	[SETTING_ITEM_ID.PROJECT_NAME]: "shared",
	[SETTING_ITEM_ID.PROJECT_PATH]: "shared",
	[SETTING_ITEM_ID.PROJECT_SCRIPTS]: "shared",
	[SETTING_ITEM_ID.PROJECT_BRANCH_PREFIX]: "v1",
	[SETTING_ITEM_ID.PROJECT_WORKTREE_LOCATION]: "shared",
	[SETTING_ITEM_ID.PROJECT_IMPORT_WORKTREES]: "v1",
	[SETTING_ITEM_ID.PROJECT_ENV_VARS]: "v2",

	[SETTING_ITEM_ID.API_KEYS_LIST]: "shared",
	[SETTING_ITEM_ID.API_KEYS_GENERATE]: "shared",

	[SETTING_ITEM_ID.PERMISSIONS_FULL_DISK_ACCESS]: "shared",
	[SETTING_ITEM_ID.PERMISSIONS_ACCESSIBILITY]: "shared",
	[SETTING_ITEM_ID.PERMISSIONS_MICROPHONE]: "shared",
	[SETTING_ITEM_ID.PERMISSIONS_APPLE_EVENTS]: "shared",
	[SETTING_ITEM_ID.PERMISSIONS_LOCAL_NETWORK]: "shared",

	[SETTING_ITEM_ID.SECURITY_EXPOSE_HOST_SERVICE_VIA_RELAY]: "shared",

	[SETTING_ITEM_ID.HOST_MEMBERS]: "shared",
	[SETTING_ITEM_ID.HOST_INVITE_MEMBER]: "shared",
	[SETTING_ITEM_ID.HOST_MEMBER_ROLE]: "shared",
	[SETTING_ITEM_ID.HOST_WORKTREE_LOCATION]: "v2",
	[SETTING_ITEM_ID.HOST_DELETE]: "shared",
};

export function isItemAllowedForVariant(
	itemId: SettingItemId,
	isV2: boolean,
): boolean {
	const variant = SETTING_ITEM_VARIANT[itemId];
	if (variant === "shared") return true;
	return isV2 ? variant === "v2" : variant === "v1";
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
		id: SETTING_ITEM_ID.ACCOUNT_PROFILE,
		titleKey: "settingsSearch.account_profile.title",
		descriptionKey: "settingsSearch.account_profile.description",
		section: "account",
		localizedKeywords: { "zh-CN": ["账户", "个人资料", "退出登录"] },
		keywords: [
			"account",
			"name",
			"email",
			"avatar",
			"user",
			"profile",
			"picture",
			"photo",
			"me",
		],
	},
	{
		id: SETTING_ITEM_ID.ACCOUNT_SIGNOUT,
		titleKey: "settingsSearch.account_signout.title",
		descriptionKey: "settingsSearch.account_signout.description",
		section: "account",
		localizedKeywords: { "zh-CN": ["账户", "个人资料", "退出登录"] },
		keywords: [
			"account",
			"sign out",
			"logout",
			"log out",
			"disconnect",
			"leave",
		],
	},
	{
		id: SETTING_ITEM_ID.ORGANIZATION_LOGO,
		titleKey: "settingsSearch.organization_logo.title",
		descriptionKey: "settingsSearch.organization_logo.description",
		section: "organization",
		localizedKeywords: { "zh-CN": ["组织", "成员", "团队", "邀请"] },
		keywords: [
			"organization",
			"logo",
			"image",
			"branding",
			"upload",
			"icon",
			"picture",
			"avatar",
		],
	},
	{
		id: SETTING_ITEM_ID.ORGANIZATION_NAME,
		titleKey: "settingsSearch.organization_name.title",
		descriptionKey: "settingsSearch.organization_name.description",
		section: "organization",
		localizedKeywords: { "zh-CN": ["组织", "成员", "团队", "邀请"] },
		keywords: [
			"organization",
			"name",
			"rename",
			"title",
			"company",
			"team name",
		],
	},
	{
		id: SETTING_ITEM_ID.ORGANIZATION_SLUG,
		titleKey: "settingsSearch.organization_slug.title",
		descriptionKey: "settingsSearch.organization_slug.description",
		section: "organization",
		localizedKeywords: { "zh-CN": ["组织", "成员", "团队", "邀请"] },
		keywords: [
			"organization",
			"slug",
			"url",
			"identifier",
			"subdomain",
			"link",
			"unique",
		],
	},
	{
		id: SETTING_ITEM_ID.ORGANIZATION_ID,
		titleKey: "settingsSearch.organization_id.title",
		descriptionKey: "settingsSearch.organization_id.description",
		section: "organization",
		localizedKeywords: { "zh-CN": ["组织", "成员", "团队", "邀请"] },
		keywords: [
			"organization",
			"id",
			"identifier",
			"uuid",
			"unique",
			"copy",
			"api",
		],
	},
	{
		id: SETTING_ITEM_ID.ORGANIZATION_MEMBERS_LIST,
		titleKey: "settingsSearch.organization_members_list.title",
		descriptionKey: "settingsSearch.organization_members_list.description",
		section: "organization",
		localizedKeywords: { "zh-CN": ["组织", "成员", "团队", "邀请"] },
		keywords: [
			"organization",
			"members",
			"team",
			"users",
			"roles",
			"people",
			"collaborators",
			"permissions",
			"access",
			"admin",
			"owner",
		],
	},
	{
		id: SETTING_ITEM_ID.ORGANIZATION_MEMBERS_INVITE,
		titleKey: "settingsSearch.organization_members_invite.title",
		descriptionKey: "settingsSearch.organization_members_invite.description",
		section: "organization",
		localizedKeywords: { "zh-CN": ["组织", "成员", "团队", "邀请"] },
		keywords: [
			"organization",
			"members",
			"invite",
			"add",
			"new member",
			"team",
			"share",
			"collaborate",
			"email",
			"send invite",
		],
	},
	{
		id: SETTING_ITEM_ID.ORGANIZATION_MEMBERS_PENDING_INVITATIONS,
		titleKey: "settingsSearch.organization_members_pending_invitations.title",
		descriptionKey:
			"settingsSearch.organization_members_pending_invitations.description",
		section: "organization",
		localizedKeywords: { "zh-CN": ["组织", "成员", "团队", "邀请"] },
		keywords: [
			"organization",
			"members",
			"invite",
			"invitation",
			"pending",
			"team",
			"waiting",
			"sent",
			"cancel",
			"resend",
			"email",
		],
	},
	{
		id: SETTING_ITEM_ID.TEAMS_LIST,
		titleKey: "settingsSearch.teams_list.title",
		descriptionKey: "settingsSearch.teams_list.description",
		section: "teams",
		localizedKeywords: { "zh-CN": ["团队", "小组"] },
		keywords: [
			"teams",
			"team",
			"group",
			"create team",
			"rename team",
			"delete team",
			"organize",
		],
	},
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
		id: SETTING_ITEM_ID.BEHAVIOR_OPEN_LINKS_IN_APP,
		titleKey: "settingsSearch.behavior_open_links_in_app.title",
		descriptionKey: "settingsSearch.behavior_open_links_in_app.description",
		section: "behavior",
		localizedKeywords: { "zh-CN": ["行为", "文件", "退出", "资源"] },
		keywords: [
			"browser",
			"links",
			"in-app",
			"external",
			"open",
			"chat",
			"terminal",
			"url",
		],
	},
	{
		id: SETTING_ITEM_ID.AGENTS_ENABLED,
		titleKey: "settingsSearch.agents_enabled.title",
		descriptionKey: "settingsSearch.agents_enabled.description",
		section: "agents",
		localizedKeywords: { "zh-CN": ["智能体", "命令", "提示词"] },
		keywords: [
			"agents",
			"enabled",
			"launcher",
			"dropdown",
			"visible",
			"show",
			"hide",
			"superset chat",
			"claude",
			"codex",
			"pi",
		],
	},
	{
		id: SETTING_ITEM_ID.AGENTS_COMMANDS,
		titleKey: "settingsSearch.agents_commands.title",
		descriptionKey: "settingsSearch.agents_commands.description",
		section: "agents",
		localizedKeywords: { "zh-CN": ["智能体", "命令", "提示词"] },
		keywords: [
			"agents",
			"commands",
			"prompt command",
			"terminal",
			"claude",
			"codex",
			"gemini",
			"opencode",
			"pi",
			"copilot",
			"cursor",
			"vibe",
			"mistral",
			"kimi",
			"moonshot",
		],
	},
	{
		id: SETTING_ITEM_ID.AGENTS_TASK_PROMPTS,
		titleKey: "settingsSearch.agents_task_prompts.title",
		descriptionKey: "settingsSearch.agents_task_prompts.description",
		section: "agents",
		localizedKeywords: { "zh-CN": ["智能体", "命令", "提示词"] },
		keywords: [
			"agents",
			"task prompt",
			"template",
			"variables",
			"prompt",
			"task",
			"superset chat",
			"launch",
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
		id: SETTING_ITEM_ID.LINKS_FILE,
		titleKey: "settingsSearch.links_file.title",
		descriptionKey: "settingsSearch.links_file.description",
		section: "links",
		localizedKeywords: { "zh-CN": ["链接", "文件", "浏览器"] },
		keywords: [
			"links",
			"file",
			"click",
			"cmd",
			"ctrl",
			"shift",
			"meta",
			"pane",
			"editor",
			"external",
			"open",
			"terminal",
			"chat",
			"markdown",
			"behavior",
		],
	},
	{
		id: SETTING_ITEM_ID.LINKS_URL,
		titleKey: "settingsSearch.links_url.title",
		descriptionKey: "settingsSearch.links_url.description",
		section: "links",
		localizedKeywords: { "zh-CN": ["链接", "文件", "浏览器"] },
		keywords: [
			"links",
			"url",
			"link",
			"click",
			"cmd",
			"ctrl",
			"shift",
			"meta",
			"browser",
			"in-app",
			"system",
			"external",
			"open",
			"terminal",
			"chat",
			"markdown",
			"behavior",
		],
	},
	{
		id: SETTING_ITEM_ID.LINKS_SIDEBAR_FILE,
		titleKey: "settingsSearch.links_sidebar_file.title",
		descriptionKey: "settingsSearch.links_sidebar_file.description",
		section: "links",
		localizedKeywords: { "zh-CN": ["链接", "文件", "浏览器"] },
		keywords: [
			"links",
			"sidebar",
			"file tree",
			"changes",
			"diff",
			"file",
			"click",
			"cmd",
			"ctrl",
			"shift",
			"meta",
			"new tab",
			"editor",
			"external",
			"open",
			"select",
			"behavior",
		],
	},
	{
		id: SETTING_ITEM_ID.LINKS_PORT,
		titleKey: "settingsSearch.links_port.title",
		descriptionKey: "settingsSearch.links_port.description",
		section: "links",
		localizedKeywords: { "zh-CN": ["链接", "文件", "浏览器"] },
		keywords: [
			"links",
			"port",
			"ports",
			"badge",
			"localhost",
			"server",
			"forwarded",
			"click",
			"cmd",
			"ctrl",
			"shift",
			"meta",
			"browser",
			"in-app",
			"system",
			"external",
			"open",
			"behavior",
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
		id: SETTING_ITEM_ID.EXPERIMENTAL_SUPERSET_V2,
		titleKey: "settingsSearch.experimental_superset_v2.title",
		descriptionKey: "settingsSearch.experimental_superset_v2.description",
		section: "experimental",
		localizedKeywords: { "zh-CN": ["实验", "预览", "迁移"] },
		keywords: [
			"experimental",
			"experiments",
			"v2",
			"v1",
			"version",
			"early access",
			"beta",
			"preview",
			"workspace",
			"workspaces",
			"toggle",
			"switch",
		],
	},
	{
		id: SETTING_ITEM_ID.EXPERIMENTAL_V1_MIGRATION,
		titleKey: "settingsSearch.experimental_v1_migration.title",
		descriptionKey: "settingsSearch.experimental_v1_migration.description",
		section: "experimental",
		localizedKeywords: { "zh-CN": ["实验", "预览", "迁移"] },
		keywords: [
			"experimental",
			"migration",
			"migrate",
			"rerun",
			"retry",
			"recover",
			"v1",
			"v2",
			"projects",
			"workspaces",
		],
	},
	{
		id: SETTING_ITEM_ID.EXPERIMENTAL_INLINE_WORKSPACE_PORTS,
		titleKey: "settingsSearch.experimental_inline_workspace_ports.title",
		descriptionKey:
			"settingsSearch.experimental_inline_workspace_ports.description",
		section: "experimental",
		localizedKeywords: { "zh-CN": ["实验", "预览", "迁移"] },
		keywords: [
			"experimental",
			"ports",
			"port",
			"inline",
			"sidebar",
			"workspace",
			"workspaces",
			"dev server",
			"toggle",
			"switch",
		],
	},
	{
		id: SETTING_ITEM_ID.EXPERIMENTAL_WORKSPACE_AGENTS,
		titleKey: "settingsSearch.experimental_workspace_agents.title",
		descriptionKey: "settingsSearch.experimental_workspace_agents.description",
		section: "experimental",
		localizedKeywords: { "zh-CN": ["实验", "预览", "迁移"] },
		keywords: [
			"experimental",
			"agents",
			"agent",
			"running",
			"inline",
			"sidebar",
			"workspace",
			"workspaces",
			"status",
			"toggle",
			"switch",
		],
	},
	{
		id: SETTING_ITEM_ID.INTEGRATIONS_LINEAR,
		titleKey: "settingsSearch.integrations_linear.title",
		descriptionKey: "settingsSearch.integrations_linear.description",
		section: "integrations",
		localizedKeywords: { "zh-CN": ["集成", "同步", "连接"] },
		keywords: [
			"integrations",
			"linear",
			"issues",
			"tasks",
			"sync",
			"connect",
			"connected",
			"project management",
		],
	},
	{
		id: SETTING_ITEM_ID.INTEGRATIONS_GITHUB,
		titleKey: "settingsSearch.integrations_github.title",
		descriptionKey: "settingsSearch.integrations_github.description",
		section: "integrations",
		localizedKeywords: { "zh-CN": ["集成", "同步", "连接"] },
		keywords: [
			"integrations",
			"github",
			"repos",
			"repositories",
			"pull requests",
			"pr",
			"sync",
			"connect",
			"connected",
			"version control",
			"git",
		],
	},
	{
		id: SETTING_ITEM_ID.INTEGRATIONS_SLACK,
		titleKey: "settingsSearch.integrations_slack.title",
		descriptionKey: "settingsSearch.integrations_slack.description",
		section: "integrations",
		localizedKeywords: { "zh-CN": ["集成", "同步", "连接"] },
		keywords: [
			"integrations",
			"slack",
			"messages",
			"conversations",
			"tasks",
			"chat",
			"sync",
			"connect",
			"connected",
			"communication",
		],
	},
	{
		id: SETTING_ITEM_ID.BILLING_OVERVIEW,
		titleKey: "settingsSearch.billing_overview.title",
		descriptionKey: "settingsSearch.billing_overview.description",
		section: "billing",
		localizedKeywords: { "zh-CN": ["计费", "套餐", "用量"] },
		keywords: [
			"billing",
			"plan",
			"subscription",
			"pro",
			"free",
			"enterprise",
			"current",
			"payment",
		],
	},
	{
		id: SETTING_ITEM_ID.BILLING_PLANS,
		titleKey: "settingsSearch.billing_plans.title",
		descriptionKey: "settingsSearch.billing_plans.description",
		section: "billing",
		localizedKeywords: { "zh-CN": ["计费", "套餐", "用量"] },
		keywords: [
			"billing",
			"upgrade",
			"pricing",
			"plans",
			"pro",
			"enterprise",
			"compare",
			"features",
		],
	},
	{
		id: SETTING_ITEM_ID.BILLING_USAGE,
		titleKey: "settingsSearch.billing_usage.title",
		descriptionKey: "settingsSearch.billing_usage.description",
		section: "billing",
		localizedKeywords: { "zh-CN": ["计费", "套餐", "用量"] },
		keywords: [
			"billing",
			"usage",
			"limits",
			"workspaces",
			"users",
			"quota",
			"seats",
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
		id: SETTING_ITEM_ID.PROJECT_ENV_VARS,
		titleKey: "settingsSearch.project_env_vars.title",
		descriptionKey: "settingsSearch.project_env_vars.description",
		section: "project",
		localizedKeywords: { "zh-CN": ["项目", "仓库", "脚本", "工作树"] },
		keywords: [
			"environment",
			"variables",
			"secrets",
			"env",
			"cloud",
			"sandbox",
		],
	},
	{
		id: SETTING_ITEM_ID.API_KEYS_LIST,
		titleKey: "settingsSearch.api_keys_list.title",
		descriptionKey: "settingsSearch.api_keys_list.description",
		section: "apikeys",
		localizedKeywords: { "zh-CN": ["API 密钥", "令牌"] },
		keywords: [
			"api",
			"key",
			"keys",
			"mcp",
			"claude",
			"integration",
			"external",
			"access",
			"token",
			"authentication",
		],
	},
	{
		id: SETTING_ITEM_ID.API_KEYS_GENERATE,
		titleKey: "settingsSearch.api_keys_generate.title",
		descriptionKey: "settingsSearch.api_keys_generate.description",
		section: "apikeys",
		localizedKeywords: { "zh-CN": ["API 密钥", "令牌"] },
		keywords: [
			"api",
			"key",
			"generate",
			"create",
			"new",
			"mcp",
			"claude desktop",
			"claude code",
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
	{
		id: SETTING_ITEM_ID.SECURITY_EXPOSE_HOST_SERVICE_VIA_RELAY,
		titleKey: "settingsSearch.security_expose_host_service_via_relay.title",
		descriptionKey:
			"settingsSearch.security_expose_host_service_via_relay.description",
		section: "security",
		localizedKeywords: { "zh-CN": ["安全", "中继", "远程"] },
		keywords: [
			"security",
			"relay",
			"remote",
			"workspace",
			"expose",
			"lockdown",
			"network",
			"inbound",
			"host service",
			"tunnel",
			"attack surface",
		],
	},
	{
		id: SETTING_ITEM_ID.HOST_MEMBERS,
		titleKey: "settingsSearch.host_members.title",
		descriptionKey: "settingsSearch.host_members.description",
		section: "hosts",
		localizedKeywords: { "zh-CN": ["主机", "成员", "工作树"] },
		keywords: [
			"host",
			"hosts",
			"member",
			"members",
			"access",
			"team",
			"share",
			"machine",
			"device",
		],
	},
	{
		id: SETTING_ITEM_ID.HOST_WORKTREE_LOCATION,
		titleKey: "settingsSearch.host_worktree_location.title",
		descriptionKey: "settingsSearch.host_worktree_location.description",
		section: "hosts",
		localizedKeywords: { "zh-CN": ["主机", "成员", "工作树"] },
		keywords: [
			"host",
			"hosts",
			"worktree",
			"worktrees",
			"location",
			"directory",
			"path",
			"folder",
			"storage",
			"default",
		],
	},
	{
		id: SETTING_ITEM_ID.HOST_INVITE_MEMBER,
		titleKey: "settingsSearch.host_invite_member.title",
		descriptionKey: "settingsSearch.host_invite_member.description",
		section: "hosts",
		localizedKeywords: { "zh-CN": ["主机", "成员", "工作树"] },
		keywords: [
			"host",
			"hosts",
			"invite",
			"add",
			"grant",
			"member",
			"access",
			"share",
		],
	},
	{
		id: SETTING_ITEM_ID.HOST_MEMBER_ROLE,
		titleKey: "settingsSearch.host_member_role.title",
		descriptionKey: "settingsSearch.host_member_role.description",
		section: "hosts",
		localizedKeywords: { "zh-CN": ["主机", "成员", "工作树"] },
		keywords: [
			"host",
			"hosts",
			"role",
			"owner",
			"member",
			"permission",
			"admin",
		],
	},
	{
		id: SETTING_ITEM_ID.HOST_DELETE,
		titleKey: "settingsSearch.host_delete.title",
		descriptionKey: "settingsSearch.host_delete.description",
		section: "hosts",
		localizedKeywords: { "zh-CN": ["主机", "成员", "工作树"] },
		keywords: [
			"host",
			"hosts",
			"delete",
			"remove",
			"machine",
			"device",
			"workspace",
			"owner",
			"danger zone",
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

// Sections whose UI pages have been removed for single-user setup.
// Their search-index entries are kept for type stability but filtered from
// user-visible search results.
const HIDDEN_SECTIONS = new Set<SettingsSection>([
	"organization",
	"teams",
	"billing",
]);

export function searchSettings(
	query: string,
	locale: Locale = DEFAULT_LOCALE,
): SettingsItem[] {
	const items = getSettingsItems(locale).filter(
		(item) => !HIDDEN_SECTIONS.has(item.section),
	);
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
 * Items in `section` that are allowed for the active v1/v2 variant and
 * (if a search query is provided) also match the query. Returns an array
 * suitable for passing to `isItemVisible` at the leaf — never `null`, so
 * variant-hidden items are always excluded.
 */
export function getVisibleItemsForSection(params: {
	section: SettingsSection;
	searchQuery: string;
	isV2: boolean;
	locale?: Locale;
}): SettingItemId[] {
	const { section, searchQuery, isV2, locale = DEFAULT_LOCALE } = params;
	const matched = searchQuery.trim()
		? getMatchingItemsForSection(searchQuery, section, locale)
		: SETTINGS_ITEMS.filter((item) => item.section === section);
	return matched
		.filter((item) => isItemAllowedForVariant(item.id, isV2))
		.map((item) => item.id);
}

/**
 * Like `getMatchCountBySection`, but excludes items that are hidden by the
 * active v1/v2 variant. Used by the sidebar so search counts and section
 * visibility agree.
 */
export function getVisibleMatchCountBySection(
	query: string,
	isV2: boolean,
	locale: Locale = DEFAULT_LOCALE,
): Partial<Record<SettingsSection, number>> {
	const matches = searchSettings(query, locale).filter((item) =>
		isItemAllowedForVariant(item.id, isV2),
	);
	const counts: Partial<Record<SettingsSection, number>> = {};
	for (const item of matches) {
		counts[item.section] = (counts[item.section] || 0) + 1;
	}
	return counts;
}

/**
 * Sections that contain at least one item allowed for the active variant.
 * Sections with no allowed items (e.g. `git` in v2, `links` in v1) should
 * be hidden from the sidebar entirely.
 */
export function getAllowedSectionsForVariant(
	isV2: boolean,
): Set<SettingsSection> {
	const sections = new Set<SettingsSection>();
	for (const item of SETTINGS_ITEMS) {
		if (isItemAllowedForVariant(item.id, isV2)) sections.add(item.section);
	}
	return sections;
}
