import type { Theme } from "shared/themes";

/**
 * Mermaid `themeVariables` derived from the active app theme. Keeps diagrams
 * in comment/markdown code blocks in sync with whichever theme is applied.
 * When no theme is provided we fall back to the runtime CSS variables so
 * diagrams still track whichever theme is currently painted onto :root.
 */
export function getMermaidThemeVariables(
	theme: Theme | null | undefined,
): Record<string, string> {
	const ui = theme?.ui;
	const isDark = theme?.type !== "light";

	const bg = ui?.background ?? "var(--background)";
	const surface = ui?.card ?? "var(--card)";
	const fg = ui?.foreground ?? "var(--foreground)";
	const border = ui?.border ?? "var(--border)";
	const line = ui?.mutedForeground ?? "var(--muted-foreground)";

	if (isDark) {
		return {
			background: bg,
			primaryColor: surface,
			primaryTextColor: fg,
			primaryBorderColor: border,
			secondaryColor: surface,
			secondaryTextColor: fg,
			secondaryBorderColor: border,
			tertiaryColor: surface,
			tertiaryTextColor: fg,
			tertiaryBorderColor: border,
			nodeBorder: border,
			nodeTextColor: fg,
			mainBkg: surface,
			clusterBkg: bg,
			titleColor: fg,
			edgeLabelBackground: "transparent",
			lineColor: line,
			textColor: fg,
		};
	}

	return {
		background: bg,
		primaryColor: surface,
		primaryTextColor: fg,
		primaryBorderColor: border,
		lineColor: line,
		textColor: fg,
	};
}
