import { appState } from "main/lib/app-state";
import type { ThemeState } from "main/lib/app-state/schemas";
import type { EditorSyntaxColors } from "shared/themes";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Zod schema for UI colors
 */
const uiColorsSchema = z.object({
	background: z.string(),
	foreground: z.string(),
	card: z.string(),
	cardForeground: z.string(),
	popover: z.string(),
	popoverForeground: z.string(),
	primary: z.string(),
	primaryForeground: z.string(),
	secondary: z.string(),
	secondaryForeground: z.string(),
	muted: z.string(),
	mutedForeground: z.string(),
	accent: z.string(),
	accentForeground: z.string(),
	tertiary: z.string(),
	tertiaryActive: z.string(),
	destructive: z.string(),
	destructiveForeground: z.string(),
	border: z.string(),
	input: z.string(),
	ring: z.string(),
	sidebar: z.string(),
	sidebarForeground: z.string(),
	sidebarPrimary: z.string(),
	sidebarPrimaryForeground: z.string(),
	sidebarAccent: z.string(),
	sidebarAccentForeground: z.string(),
	sidebarBorder: z.string(),
	sidebarRing: z.string(),
	chart1: z.string(),
	chart2: z.string(),
	chart3: z.string(),
	chart4: z.string(),
	chart5: z.string(),
	highlightMatch: z.string(),
	highlightActive: z.string(),
	highlight: z.string().optional(),
	highlightForeground: z.string().optional(),
});

/**
 * Zod schema for terminal colors
 */
const terminalColorsSchema = z.object({
	background: z.string(),
	foreground: z.string(),
	cursor: z.string(),
	cursorAccent: z.string().optional(),
	selectionBackground: z.string().optional(),
	selectionForeground: z.string().optional(),
	black: z.string(),
	red: z.string(),
	green: z.string(),
	yellow: z.string(),
	blue: z.string(),
	magenta: z.string(),
	cyan: z.string(),
	white: z.string(),
	brightBlack: z.string(),
	brightRed: z.string(),
	brightGreen: z.string(),
	brightYellow: z.string(),
	brightBlue: z.string(),
	brightMagenta: z.string(),
	brightCyan: z.string(),
	brightWhite: z.string(),
});

/**
 * Zod schema for editor/diff color + syntax overrides (Theme.editor).
 *
 * Persisted faithfully via record() so imported custom themes keep their
 * editor/diff syntax colors across reloads. Omitting this previously stripped
 * `editor` on save (Zod drops unknown keys), so on reload getEditorTheme fell
 * back to the derived terminal palette and diff/editor syntax lost its theme.
 */
const editorThemeSchema = z.object({
	colors: z.record(z.string(), z.string()).optional(),
	syntax: z
		.record(z.string(), z.string())
		.transform((value) => value as Partial<EditorSyntaxColors>)
		.optional(),
});

/**
 * Zod schema for Theme
 */
const themeSchema = z.object({
	id: z.string(),
	name: z.string(),
	author: z.string().optional(),
	version: z.string().optional(),
	description: z.string().optional(),
	type: z.enum(["dark", "light"]),
	ui: uiColorsSchema,
	terminal: terminalColorsSchema,
	editor: editorThemeSchema.optional(),
	isBuiltIn: z.boolean().optional(),
	isCustom: z.boolean().optional(),
});

/**
 * Zod schema for ThemeState
 */
const themeStateSchema = z.object({
	activeThemeId: z.string(),
	customThemes: z.array(themeSchema),
	systemLightThemeId: z.string().optional(),
	systemDarkThemeId: z.string().optional(),
});

/**
 * UI State router - manages tabs and theme persistence via lowdb
 */
export const createUiStateRouter = () => {
	return router({
		// Theme state procedures
		theme: router({
			get: publicProcedure.query((): ThemeState => {
				return appState.data.themeState;
			}),

			set: publicProcedure
				.input(themeStateSchema)
				.mutation(async ({ input }) => {
					appState.data.themeState = input;
					await appState.write();
					return { success: true };
				}),
		}),

		// Legacy hotkeys state (read-only, for one-time migration to localStorage)
		hotkeys: router({
			get: publicProcedure.query(() => {
				return appState.data.hotkeysState;
			}),
		}),
	});
};
