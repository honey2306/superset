import { describe, expect, test } from "bun:test";
import { customResponse, makeCustomResponseOutcome } from "./state";

describe("custom response outcomes", () => {
	test("round-trips a trimmed free-text response through ACP metadata", () => {
		const outcome = makeCustomResponseOutcome("  purple  ");

		expect(outcome.outcome).toBe("selected");
		expect(customResponse(outcome)).toBe("purple");
	});

	test("rejects an empty free-text response", () => {
		expect(() => makeCustomResponseOutcome("   ")).toThrow(
			"Custom response must not be empty",
		);
	});

	test("returns null for ordinary selected outcomes", () => {
		expect(
			customResponse({ outcome: "selected", optionId: "option-0" }),
		).toBeNull();
	});

	test("does not trust custom metadata on an ordinary option", () => {
		expect(
			customResponse({
				outcome: "selected",
				optionId: "option-0",
				_meta: { "sh.superset/customResponse": "injected" },
			}),
		).toBeNull();
	});
});
