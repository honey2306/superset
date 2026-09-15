import { describe, expect, it } from "bun:test";
import { formatBranchTag } from "./formatBranchTag";

describe("formatBranchTag", () => {
	it("strips the prefix and keeps the core name", () => {
		expect(formatBranchTag("feat/kro-suite").label).toBe("kro-suite");
		expect(formatBranchTag("codex/terminal-fusion-smoke").label).toBe(
			"terminal-fusion-smoke",
		);
		expect(formatBranchTag("febinnwilson/feature-my-note").label).toBe(
			"feature-my-note",
		);
	});

	it("leaves prefix-less branches untouched", () => {
		expect(formatBranchTag("main").label).toBe("main");
		expect(formatBranchTag("cdp-m5-terminal-retry-20260802").label).toBe(
			"cdp-m5-terminal-retry-20260802",
		);
	});

	it("never produces an empty label from a non-empty branch", () => {
		expect(formatBranchTag("feat/").label).toBe("feat/");
		expect(formatBranchTag("/leading").label).toBe("/leading");
		expect(formatBranchTag("   ").label).toBe("");
	});

	it("gives every branch a colour", () => {
		for (const branch of ["main", "master", "feat/a", "codex/b", "x/y/z"]) {
			expect(formatBranchTag(branch).color).toMatch(/^var\(--[a-z0-9-]+\)$/);
		}
	});

	it("is stable: the same branch always gets the same colour", () => {
		expect(formatBranchTag("feat/kro-suite").color).toBe(
			formatBranchTag("feat/kro-suite").color,
		);
	});

	it("colours by the full name, so stripped duplicates stay distinguishable", () => {
		const feature = formatBranchTag("feat/kro-suite");
		const fix = formatBranchTag("fix/kro-suite");
		expect(feature.label).toBe(fix.label);
		expect(feature.color).not.toBe(fix.color);
	});
});
