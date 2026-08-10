import { describe, expect, test } from "bun:test";
import {
	DEFAULT_TERMINAL_FONT_FAMILY,
	resolveTerminalAppearance,
	sanitizeTerminalFontFamily,
} from "./index";

describe("terminal appearance", () => {
	test("preserves the existing rendering defaults", () => {
		const theme = { background: "#111111", foreground: "#eeeeee" };
		expect(resolveTerminalAppearance(theme)).toEqual({
			theme,
			background: "#111111",
			fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
			fontSize: 14,
			lineHeight: 1,
			letterSpacing: 0,
			fontWeight: "normal",
			ligatures: true,
			minimumContrastRatio: 1,
			cursorStyle: "block",
			cursorBlink: true,
		});
	});

	test("maps persisted overrides to xterm appearance", () => {
		const appearance = resolveTerminalAppearance(
			{ background: "#000000" },
			{
				terminalFontFamily: "monospace",
				terminalFontSize: 15.5,
				terminalLineHeight: 1.3,
				terminalLetterSpacing: 0.5,
				terminalFontWeight: 500,
				terminalLigatures: false,
				terminalMinimumContrast: 4.5,
				terminalCursorStyle: "underline",
				terminalCursorBlink: false,
			},
		);

		expect(appearance).toMatchObject({
			fontFamily: "monospace",
			fontSize: 15.5,
			lineHeight: 1.3,
			letterSpacing: 0.5,
			fontWeight: 500,
			ligatures: false,
			minimumContrastRatio: 4.5,
			cursorStyle: "underline",
			cursorBlink: false,
		});
	});

	test("rejects a proportional generic as the primary terminal font", () => {
		expect(sanitizeTerminalFontFamily("sans-serif, monospace")).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY,
		);
	});
});
