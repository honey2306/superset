import { describe, expect, it } from "bun:test";
import {
	deepseekIcon,
	getPresetIcon,
	hasBuiltInPresetIcon,
	myflickerIcon,
	PRESET_ICONS,
} from "./index";

describe("built-in preset icons", () => {
	function expectIconForBothThemes(presetId: string, icon: string): void {
		expect(PRESET_ICONS[presetId]).toEqual({ light: icon, dark: icon });
		expect(getPresetIcon(presetId, false)).toBe(icon);
		expect(getPresetIcon(presetId, true)).toBe(icon);
		expect(hasBuiltInPresetIcon(presetId)).toBe(true);
	}

	it("registers DeepSeek for both themes", () => {
		expectIconForBothThemes("deepseek", deepseekIcon);
	});

	it("registers MyFlicker for both themes", () => {
		expectIconForBothThemes("myflicker", myflickerIcon);
	});

	it("normalizes built-in ids like other preset icons", () => {
		expect(getPresetIcon("  MyFlicker  ", false)).toBe(myflickerIcon);
		expect(getPresetIcon("DeepSeek", true)).toBe(deepseekIcon);
	});
});
