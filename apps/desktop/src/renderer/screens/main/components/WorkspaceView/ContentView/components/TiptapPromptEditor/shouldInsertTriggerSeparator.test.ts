import { describe, expect, test } from "bun:test";
import { shouldInsertTriggerSeparator } from "./shouldInsertTriggerSeparator";

describe("shouldInsertTriggerSeparator", () => {
	test("separates a trigger after text or an inline chip", () => {
		expect(
			shouldInsertTriggerSeparator(
				{ isText: true, type: { name: "text" } },
				"e",
			),
		).toBe(true);
		expect(
			shouldInsertTriggerSeparator(
				{ isText: false, type: { name: "file-mention" } },
				"",
			),
		).toBe(true);
	});

	test("does not separate at paragraph start, after whitespace, or after a break", () => {
		expect(shouldInsertTriggerSeparator(null, "")).toBe(false);
		expect(
			shouldInsertTriggerSeparator(
				{ isText: true, type: { name: "text" } },
				" ",
			),
		).toBe(false);
		expect(
			shouldInsertTriggerSeparator(
				{ isText: false, type: { name: "hardBreak" } },
				"",
			),
		).toBe(false);
	});
});
