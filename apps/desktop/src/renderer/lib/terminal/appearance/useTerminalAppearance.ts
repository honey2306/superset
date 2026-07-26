import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTerminalTheme } from "renderer/stores/theme";
import {
	DEFAULT_TERMINAL_FONT_SIZE,
	getDefaultTerminalAppearance,
	sanitizeTerminalFontFamily,
	type TerminalAppearance,
} from ".";

const fallbackTheme = getDefaultTerminalAppearance().theme;

/** Shared terminal appearance settings for every renderer terminal surface. */
export function useTerminalAppearance(): TerminalAppearance {
	const terminalTheme = useTerminalTheme();
	const { data: fontSettings } = useQuery({
		queryKey: ["electron", "settings", "getFontSettings"],
		queryFn: () => electronTrpcClient.settings.getFontSettings.query(),
		staleTime: 30_000,
	});

	return useMemo(() => {
		const theme = terminalTheme ?? fallbackTheme;
		const fontFamily = sanitizeTerminalFontFamily(
			fontSettings?.terminalFontFamily,
		);
		const fontSize =
			fontSettings?.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE;

		return {
			theme,
			background: theme.background ?? "#151110",
			fontFamily,
			fontSize,
		};
	}, [terminalTheme, fontSettings]);
}
