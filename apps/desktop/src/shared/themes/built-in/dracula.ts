import type { EditorSyntaxColors, Theme } from "../types";

// Dracula palette — https://draculatheme.com/contribute
// Reused across UI / terminal / editor so every surface reads as one system.
const DRACULA = {
	bg: "#282a36",
	bgDeep: "#1e1f29",
	surface: "#2d2f3f",
	popover: "#21222c",
	currentLine: "#44475a",
	comment: "#6272a4",
	fg: "#f8f8f2",
	pink: "#ff79c6",
	purple: "#bd93f9",
	green: "#50fa7b",
	orange: "#ffb86c",
	red: "#ff5555",
	cyan: "#8be9fd",
	yellow: "#f1fa8c",
} as const;

/**
 * Dracula — the design-system theme derived from
 * `designs/superset-design-system/`. Pink stays as tint/dot/ring only; the
 * primary text stays neutral. See `designs/superset-design-system/readme.md`
 * for the full visual guide.
 */
export const draculaTheme: Theme = {
	id: "dracula",
	name: "Dracula",
	author: "Superset",
	type: "dark",
	isBuiltIn: true,

	ui: {
		// Core surfaces
		background: DRACULA.bgDeep,
		foreground: DRACULA.fg,
		card: DRACULA.bg,
		cardForeground: DRACULA.fg,
		popover: DRACULA.popover,
		popoverForeground: DRACULA.fg,

		// Primary (neutral text on tint bg — the "quiet pink" system)
		primary: DRACULA.fg,
		primaryForeground: DRACULA.bg,

		// Secondary — Dracula "current line" gray
		secondary: DRACULA.currentLine,
		secondaryForeground: DRACULA.fg,

		// Muted
		muted: DRACULA.currentLine,
		mutedForeground: "#d0d3e0",

		// Accent — Dracula "comment" blue-gray as UI accent stripe
		accent: DRACULA.comment,
		accentForeground: DRACULA.fg,

		// Tertiary — panel backgrounds
		tertiary: DRACULA.popover,
		tertiaryActive: "#343746",

		// Destructive — Dracula red
		destructive: DRACULA.red,
		destructiveForeground: "#ffe4e4",

		// Borders — Dracula current-line (subtle) + ring on comment
		border: DRACULA.currentLine,
		input: DRACULA.currentLine,
		ring: DRACULA.comment,

		// Sidebar — sits between page bg and surface
		sidebar: DRACULA.popover,
		sidebarForeground: DRACULA.fg,
		sidebarPrimary: DRACULA.pink,
		sidebarPrimaryForeground: DRACULA.bg,
		sidebarAccent: "#343746",
		sidebarAccentForeground: DRACULA.fg,
		sidebarBorder: DRACULA.currentLine,
		sidebarRing: DRACULA.comment,

		// Charts — Dracula bright palette in author order
		chart1: DRACULA.pink,
		chart2: DRACULA.purple,
		chart3: DRACULA.green,
		chart4: DRACULA.orange,
		chart5: DRACULA.cyan,

		// Search highlights — pink tint stays a tint
		highlightMatch: "rgba(255, 121, 198, 0.2)",
		highlightActive: "rgba(255, 121, 198, 0.55)",

		// Brand highlight — Dracula pink
		highlight: DRACULA.pink,
		highlightForeground: DRACULA.bg,
	},

	terminal: {
		background: DRACULA.bg,
		foreground: DRACULA.fg,
		cursor: DRACULA.pink,
		cursorAccent: DRACULA.bg,
		selectionBackground: "rgba(255, 121, 198, 0.35)",

		// Standard ANSI — Dracula official mapping
		black: DRACULA.bg,
		red: DRACULA.red,
		green: DRACULA.green,
		yellow: DRACULA.yellow,
		blue: DRACULA.purple,
		magenta: DRACULA.pink,
		cyan: DRACULA.cyan,
		white: DRACULA.fg,

		// Bright ANSI
		brightBlack: DRACULA.comment,
		brightRed: "#ff6e6e",
		brightGreen: "#69ff94",
		brightYellow: "#ffffa5",
		brightBlue: "#d6acff",
		brightMagenta: "#ff92df",
		brightCyan: "#a4ffff",
		brightWhite: "#ffffff",
	},

	editor: {
		// Only the syntax colors that meaningfully differ from token-mapped fg;
		// the rest inherit from the editor-theme derivation of `ui`.
		syntax: {
			comment: DRACULA.comment,
			keyword: DRACULA.pink,
			string: DRACULA.yellow,
			number: DRACULA.purple,
			functionCall: DRACULA.green,
			variableName: DRACULA.fg,
			typeName: DRACULA.cyan,
			operator: DRACULA.pink,
			constant: DRACULA.purple,
			property: DRACULA.fg,
		} as Partial<EditorSyntaxColors>,
	},
};
