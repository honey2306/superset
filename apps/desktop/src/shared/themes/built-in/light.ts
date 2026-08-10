import type { Theme } from "../types";

/**
 * Light theme - based on the original Superset light mode colors
 */
export const lightTheme: Theme = {
	id: "light",
	name: "Light",
	author: "Superset",
	type: "light",
	isBuiltIn: true,

	ui: {
		background: "oklch(1 0 0)",
		foreground: "oklch(0.145 0 0)",
		card: "oklch(0.97 0 0)",
		cardForeground: "oklch(0.145 0 0)",
		popover: "oklch(0.97 0 0)",
		popoverForeground: "oklch(0.145 0 0)",
		primary: "oklch(0.205 0 0)",
		primaryForeground: "oklch(0.985 0 0)",
		secondary: "oklch(0.97 0 0)",
		secondaryForeground: "oklch(0.205 0 0)",
		muted: "oklch(0.97 0 0)",
		mutedForeground: "oklch(0.556 0 0)",
		// Accent — pink stays a tint (same DS rule as Dracula, applied to
		// a light canvas). `bg-accent` reads as a soft brand highlight.
		accent: "rgba(255, 121, 198, 0.12)",
		accentForeground: "#d13a91",
		tertiary: "oklch(0.95 0.003 40)",
		tertiaryActive: "oklch(0.90 0.003 40)",
		destructive: "oklch(0.577 0.245 27.325)",
		destructiveForeground: "oklch(0.985 0 0)",
		border: "oklch(0.922 0 0)",
		input: "oklch(0.922 0 0)",
		ring: "#ff79c6",
		sidebar: "oklch(0.985 0 0)",
		sidebarForeground: "oklch(0.145 0 0)",
		sidebarPrimary: "#ff79c6",
		sidebarPrimaryForeground: "oklch(0.985 0 0)",
		sidebarAccent: "rgba(255, 121, 198, 0.12)",
		sidebarAccentForeground: "#d13a91",
		sidebarBorder: "oklch(0.922 0 0)",
		sidebarRing: "#ff79c6",
		chart1: "#ff79c6",
		chart2: "oklch(0.6 0.118 184.704)",
		chart3: "oklch(0.398 0.07 227.392)",
		chart4: "oklch(0.828 0.189 84.429)",
		chart5: "oklch(0.769 0.188 70.08)",

		// Search highlights — same pink tint on a light canvas
		highlightMatch: "rgba(255, 121, 198, 0.25)",
		highlightActive: "rgba(255, 121, 198, 0.55)",

		// Brand highlight — pink
		highlight: "#ff79c6",
		highlightForeground: "oklch(0.985 0 0)",
	},

	terminal: {
		background: "#ffffff",
		foreground: "#000000",
		cursor: "#000000",
		cursorAccent: "#ffffff",
		selectionBackground: "#add6ff",

		// Standard ANSI colors (xterm defaults)
		black: "#2e3436",
		red: "#cc0000",
		green: "#4e9a06",
		yellow: "#c4a000",
		blue: "#3465a4",
		magenta: "#75507b",
		cyan: "#06989a",
		white: "#d3d7cf",

		// Bright ANSI colors (xterm defaults)
		brightBlack: "#555753",
		brightRed: "#ef2929",
		brightGreen: "#8ae234",
		brightYellow: "#fce94f",
		brightBlue: "#729fcf",
		brightMagenta: "#ad7fa8",
		brightCyan: "#34e2e2",
		brightWhite: "#eeeeec",
	},
};
