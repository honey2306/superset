import { describe, expect, test } from "bun:test";
import {
	getDefaultSeedPresets,
	getPresetById,
	HOST_AGENT_PRESETS,
} from "./host-agent-presets";

describe("host agent preset visibility", () => {
	test("does not expose DeepSeek in user-facing catalogs", () => {
		expect(HOST_AGENT_PRESETS.map((preset) => preset.presetId)).not.toContain(
			"deepseek",
		);
		expect(
			getDefaultSeedPresets().map((preset) => preset.presetId),
		).not.toContain("deepseek");
		expect(getPresetById("deepseek")).toBeUndefined();
	});
});
