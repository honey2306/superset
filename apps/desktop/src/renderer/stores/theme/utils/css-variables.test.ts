import { describe, expect, it } from "bun:test";
import { draculaTheme } from "shared/themes";
import { computeDSExtendedTokens } from "./css-variables";

describe("computeDSExtendedTokens", () => {
	it("uses sRGB for Dracula's neutral surfaces and overlays", () => {
		const tokens = computeDSExtendedTokens(draculaTheme);

		for (const token of [
			"--ds-surface-elev",
			"--fg-mute",
			"--fg-faint",
			"--line",
			"--line-strong",
			"--hover",
			"--selected",
		]) {
			expect(tokens[token]).toContain("color-mix(in srgb,");
			expect(tokens[token]).not.toContain("in oklch");
		}
	});

	it("keeps chromatic semantic tints in OKLCH", () => {
		const tokens = computeDSExtendedTokens(draculaTheme);

		for (const token of [
			"--accent-line",
			"--accent-glow",
			"--success-tint",
			"--warning-tint",
			"--danger-tint",
			"--info-tint",
			"--ring-halo",
		]) {
			expect(tokens[token]).toContain("color-mix(in oklch,");
		}
	});
});
