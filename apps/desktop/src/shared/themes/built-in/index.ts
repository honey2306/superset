import type { Theme } from "../types";
import { draculaTheme } from "./dracula";
import { darkTheme } from "./ember";
import { lightTheme } from "./light";
import { monokaiTheme } from "./monokai";
import { zedOneDark } from "./zed-one-dark";
/**
 * All built-in themes
 */
export const builtInThemes: Theme[] = [
	draculaTheme,
	zedOneDark,
	darkTheme,
	lightTheme,
	monokaiTheme,
];

/**
 * Default theme ID
 */
export const DEFAULT_THEME_ID = "dracula";

/**
 * Get a built-in theme by ID
 */
export function getBuiltInTheme(id: string): Theme | undefined {
	return builtInThemes.find((theme) => theme.id === id);
}

// Re-export individual themes
export { darkTheme, draculaTheme, lightTheme, monokaiTheme, zedOneDark };
