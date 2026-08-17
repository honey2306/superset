import { getTerminalColors, type Theme } from "shared/themes";
import type { UIColors } from "shared/themes/types";

/**
 * Maps UI color keys to CSS variable names
 */
const UI_COLOR_TO_CSS_VAR: Record<keyof UIColors, string> = {
	background: "--background",
	foreground: "--foreground",
	card: "--card",
	cardForeground: "--card-foreground",
	popover: "--popover",
	popoverForeground: "--popover-foreground",
	primary: "--primary",
	primaryForeground: "--primary-foreground",
	secondary: "--secondary",
	secondaryForeground: "--secondary-foreground",
	muted: "--muted",
	mutedForeground: "--muted-foreground",
	accent: "--accent",
	accentForeground: "--accent-foreground",
	tertiary: "--tertiary",
	tertiaryActive: "--tertiary-active",
	destructive: "--destructive",
	destructiveForeground: "--destructive-foreground",
	border: "--border",
	input: "--input",
	ring: "--ring",
	sidebar: "--sidebar",
	sidebarForeground: "--sidebar-foreground",
	sidebarPrimary: "--sidebar-primary",
	sidebarPrimaryForeground: "--sidebar-primary-foreground",
	sidebarAccent: "--sidebar-accent",
	sidebarAccentForeground: "--sidebar-accent-foreground",
	sidebarBorder: "--sidebar-border",
	sidebarRing: "--sidebar-ring",
	chart1: "--chart-1",
	chart2: "--chart-2",
	chart3: "--chart-3",
	chart4: "--chart-4",
	chart5: "--chart-5",
	highlightMatch: "--highlight-match",
	highlightActive: "--highlight-active",
	highlight: "--highlight",
	highlightForeground: "--highlight-foreground",
};

/**
 * DS extended palette derived from the active theme.
 *
 * The base pre-hydration values in `globals.css` are Dracula-frozen, so
 * switching to any other theme without re-writing these variables leaves
 * pink accents / green success bleeding through. We derive them from
 * whichever theme is now active so every semantic utility (text-success,
 * bg-accent-tint, border-line, ...) follows the theme's palette.
 */
function computeDSExtendedTokens(theme: Theme): Record<string, string> {
	const ui = theme.ui;
	const terminal = getTerminalColors(theme);
	const fg = ui.foreground;
	const bg = ui.background;

	return {
		"--ds-page-bg": bg,
		"--ds-surface": ui.card,
		"--ds-surface-elev": `color-mix(in oklch, ${bg} 92%, ${fg} 8%)`,
		"--ds-surface-sunk": ui.popover,

		"--fg": fg,
		"--fg-mute": `color-mix(in oklch, ${fg} 55%, transparent)`,
		"--fg-faint": `color-mix(in oklch, ${fg} 38%, transparent)`,
		"--fg-inverse": bg,

		"--line": `color-mix(in oklch, ${fg} 10%, transparent)`,
		"--line-strong": `color-mix(in oklch, ${fg} 18%, transparent)`,
		"--hover": `color-mix(in oklch, ${fg} 6%, transparent)`,
		"--selected": `color-mix(in oklch, ${fg} 10%, transparent)`,

		"--accent-solid": ui.accentForeground,
		"--accent-2": ui.chart2,
		"--accent-tint": ui.accent,
		"--accent-line": `color-mix(in oklch, ${ui.accentForeground} 55%, transparent)`,
		"--accent-glow": `color-mix(in oklch, ${ui.accentForeground} 55%, transparent)`,

		"--success": terminal.green,
		"--warning": terminal.yellow,
		"--danger": ui.destructive,
		"--info": terminal.cyan,
		"--success-tint": `color-mix(in oklch, ${terminal.green} 14%, transparent)`,
		"--warning-tint": `color-mix(in oklch, ${terminal.yellow} 14%, transparent)`,
		"--danger-tint": `color-mix(in oklch, ${ui.destructive} 14%, transparent)`,
		"--info-tint": `color-mix(in oklch, ${terminal.cyan} 14%, transparent)`,

		"--ring-halo": `color-mix(in oklch, ${ui.ring} 22%, transparent)`,
	};
}

/**
 * Apply UI colors to CSS variables on :root, plus derive the DS extended
 * palette (accent-solid, success, warning, danger, info, fg ladder, line
 * ladder, surface tokens) so those follow the active theme instead of
 * staying pinned to the Dracula pre-hydration fallback in globals.css.
 */
export function applyUIColors(colors: UIColors, theme?: Theme): void {
	const root = document.documentElement;

	for (const [key, cssVar] of Object.entries(UI_COLOR_TO_CSS_VAR)) {
		const value = colors[key as keyof UIColors];
		if (value) {
			root.style.setProperty(cssVar, value);
		}
	}

	if (theme) {
		const extended = computeDSExtendedTokens(theme);
		for (const [cssVar, value] of Object.entries(extended)) {
			root.style.setProperty(cssVar, value);
		}
	}
}

/**
 * Update dark/light mode class based on theme type
 */
export function updateThemeClass(type: "dark" | "light"): void {
	const html = document.documentElement;
	if (type === "dark") {
		html.classList.add("dark");
		html.classList.remove("light");
	} else {
		html.classList.add("light");
		html.classList.remove("dark");
	}
}

const DS_EXTENDED_CSS_VARS = [
	"--ds-page-bg",
	"--ds-surface",
	"--ds-surface-elev",
	"--ds-surface-sunk",
	"--fg",
	"--fg-mute",
	"--fg-faint",
	"--fg-inverse",
	"--line",
	"--line-strong",
	"--hover",
	"--selected",
	"--accent-solid",
	"--accent-2",
	"--accent-tint",
	"--accent-line",
	"--accent-glow",
	"--success",
	"--warning",
	"--danger",
	"--info",
	"--success-tint",
	"--warning-tint",
	"--danger-tint",
	"--info-tint",
	"--ring-halo",
];

/**
 * Remove all theme CSS variables (reset to stylesheet defaults)
 */
export function clearThemeVariables(): void {
	const root = document.documentElement;
	for (const cssVar of Object.values(UI_COLOR_TO_CSS_VAR)) {
		root.style.removeProperty(cssVar);
	}
	for (const cssVar of DS_EXTENDED_CSS_VARS) {
		root.style.removeProperty(cssVar);
	}
}
