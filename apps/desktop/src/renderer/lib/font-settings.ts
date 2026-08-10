import type { ElectronRouterOutputs } from "./electron-trpc";

/** One cache identity for typography consumers outside the tRPC React hooks. */
export const FONT_SETTINGS_QUERY_KEY = [
	"electron",
	"settings",
	"getFontSettings",
] as const;

export type FontSettings = ElectronRouterOutputs["settings"]["getFontSettings"];
