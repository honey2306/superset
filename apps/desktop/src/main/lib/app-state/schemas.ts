/**
 * UI state schemas (persisted from renderer zustand stores)
 */
import type { Theme } from "shared/themes";

export interface ThemeState {
	activeThemeId: string;
	customThemes: Theme[];
	systemLightThemeId?: string;
	systemDarkThemeId?: string;
}

/** Legacy hotkeys state shape (kept for reading old app-state.json during migration) */
interface LegacyHotkeysState {
	version: number;
	byPlatform: Record<string, Record<string, string | null>>;
}

export interface AppState {
	themeState: ThemeState;
	hotkeysState: LegacyHotkeysState;
	/** App version at last launch; a mismatch means an update was just installed */
	lastRunVersion?: string;
}

export const defaultAppState: AppState = {
	themeState: {
		activeThemeId: "dark",
		customThemes: [],
		systemLightThemeId: "light",
		systemDarkThemeId: "dark",
	},
	hotkeysState: {
		version: 1,
		byPlatform: { darwin: {}, win32: {}, linux: {} },
	},
};
