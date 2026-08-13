import type {
	AgentCustomDefinition,
	AgentPresetOverrideEnvelope,
} from "@superset/shared/agent-custom";

import type {
	ExternalApp,
	FileOpenMode,
	TerminalLinkBehavior,
	TerminalPreset,
} from "@superset/shared/desktop-types";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
	id: integer("id").primaryKey().default(1),
	lastActiveWorkspaceId: text("last_active_workspace_id"),
	terminalPresets: text("terminal_presets", { mode: "json" }).$type<
		TerminalPreset[]
	>(),
	terminalPresetsInitialized: integer("terminal_presets_initialized", {
		mode: "boolean",
	}),
	agentPresetOverrides: text("agent_preset_overrides", {
		mode: "json",
	}).$type<AgentPresetOverrideEnvelope>(),
	agentCustomDefinitions: text("agent_custom_definitions", {
		mode: "json",
	}).$type<AgentCustomDefinition[]>(),
	agentPresetPermissionsMigratedAt: integer(
		"agent_preset_permissions_migrated_at",
	),
	selectedRingtoneId: text("selected_ringtone_id"),
	confirmOnQuit: integer("confirm_on_quit", { mode: "boolean" }),
	terminalLinkBehavior: text(
		"terminal_link_behavior",
	).$type<TerminalLinkBehavior>(),
	autoApplyDefaultPreset: integer("auto_apply_default_preset", {
		mode: "boolean",
	}),
	notificationSoundsMuted: integer("notification_sounds_muted", {
		mode: "boolean",
	}),
	notificationVolume: integer("notification_volume"),
	deleteLocalBranch: integer("delete_local_branch", { mode: "boolean" }),
	fileOpenMode: text("file_open_mode").$type<FileOpenMode>(),
	showPresetsBar: integer("show_presets_bar", { mode: "boolean" }),
	useCompactTerminalAddButton: integer("use_compact_terminal_add_button", {
		mode: "boolean",
	}),
	useAcpForAgentPresets: integer("use_acp_for_agent_presets", {
		mode: "boolean",
	}),
	terminalFontFamily: text("terminal_font_family"),
	terminalFontSize: integer("terminal_font_size"),
	terminalLineHeight: real("terminal_line_height"),
	terminalLetterSpacing: real("terminal_letter_spacing"),
	terminalFontWeight: integer("terminal_font_weight"),
	terminalLigatures: integer("terminal_ligatures", { mode: "boolean" }),
	terminalMinimumContrast: real("terminal_minimum_contrast"),
	terminalCursorStyle: text("terminal_cursor_style").$type<
		"block" | "bar" | "underline"
	>(),
	terminalCursorBlink: integer("terminal_cursor_blink", { mode: "boolean" }),
	terminalParkedRuntimeCap: integer("terminal_parked_runtime_cap"),
	editorFontFamily: text("editor_font_family"),
	editorFontSize: integer("editor_font_size"),
	editorLineHeight: real("editor_line_height"),
	editorLetterSpacing: real("editor_letter_spacing"),
	editorFontWeight: integer("editor_font_weight"),
	editorLigatures: integer("editor_ligatures", { mode: "boolean" }),
	showResourceMonitor: integer("show_resource_monitor", { mode: "boolean" }),
	defaultEditor: text("default_editor").$type<ExternalApp>(),
});

export type InsertSettings = typeof settings.$inferInsert;
export type SelectSettings = typeof settings.$inferSelect;
