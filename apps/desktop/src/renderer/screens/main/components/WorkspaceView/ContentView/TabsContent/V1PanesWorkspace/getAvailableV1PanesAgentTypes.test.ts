import { describe, expect, test } from "bun:test";
import {
	canCreateV1PanesAgentPreset,
	getAvailableV1PanesAgentTypes,
} from "./getAvailableV1PanesAgentTypes";

const preset = (name: string) => ({ name });

describe("getAvailableV1PanesAgentTypes", () => {
	test("excludes built-in agents already represented by matched preset names", () => {
		const available = getAvailableV1PanesAgentTypes([
			preset("claude"),
			preset("  CoDeX  "),
			preset("custom"),
		]);

		expect(available).not.toContain("claude");
		expect(available).not.toContain("codex");
		expect(available).toContain("amp");
	});
});

describe("canCreateV1PanesAgentPreset", () => {
	test("rejects creation while a preset mutation is pending", () => {
		expect(
			canCreateV1PanesAgentPreset({
				agent: "amp",
				matchedPresets: [],
				isPending: true,
				inFlightAgentTypes: new Set(),
			}),
		).toBe(false);
	});

	test("rejects creation for an agent already locked in flight", () => {
		expect(
			canCreateV1PanesAgentPreset({
				agent: "amp",
				matchedPresets: [],
				isPending: false,
				inFlightAgentTypes: new Set(["amp"]),
			}),
		).toBe(false);
	});
});
