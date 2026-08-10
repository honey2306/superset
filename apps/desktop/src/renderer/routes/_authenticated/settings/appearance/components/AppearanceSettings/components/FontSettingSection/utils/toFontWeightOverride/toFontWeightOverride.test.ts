import { describe, expect, it } from "bun:test";
import { toFontWeightOverride } from "./toFontWeightOverride";

describe("toFontWeightOverride", () => {
	it("keeps normal weight unset and preserves explicit weights", () => {
		expect(toFontWeightOverride(null)).toBeNull();
		expect(toFontWeightOverride(400)).toBeNull();
		expect(toFontWeightOverride(700)).toBe(700);
	});
});
