import { describe, expect, test } from "bun:test";
import {
	canCreatePanesAgentPreset,
	getAvailablePanesAgentTypes,
} from "./getAvailablePanesAgentTypes";

const preset = (name: string) => ({ name });

describe("getAvailablePanesAgentTypes", () => {
	test("excludes built-in agents already represented by matched preset names", () => {
		const available = getAvailablePanesAgentTypes([
			preset("claude"),
			preset("  CoDeX  "),
			preset("custom"),
		]);

		expect(available).not.toContain("claude");
		expect(available).not.toContain("codex");
		expect(available).toContain("amp");
	});
});

describe("canCreatePanesAgentPreset", () => {
	test("rejects creation while a preset mutation is pending", () => {
		expect(
			canCreatePanesAgentPreset({
				agent: "amp",
				matchedPresets: [],
				isPending: true,
				inFlightAgentTypes: new Set(),
			}),
		).toBe(false);
	});

	test("rejects creation for an agent already locked in flight", () => {
		expect(
			canCreatePanesAgentPreset({
				agent: "amp",
				matchedPresets: [],
				isPending: false,
				inFlightAgentTypes: new Set(["amp"]),
			}),
		).toBe(false);
	});
});
