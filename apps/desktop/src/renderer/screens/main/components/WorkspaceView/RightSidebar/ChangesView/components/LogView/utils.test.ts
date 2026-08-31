import { describe, expect, test } from "bun:test";
import { getLoadedCommitCount, toggleSelectedCommit } from "./utils";

describe("toggleSelectedCommit", () => {
	test("selects a different commit", () => {
		expect(toggleSelectedCommit("abc", "def")).toBe("def");
	});

	test("collapses the selected commit", () => {
		expect(toggleSelectedCommit("abc", "abc")).toBeNull();
	});
});

describe("getLoadedCommitCount", () => {
	test("marks a result set that can load more as incomplete", () => {
		expect(getLoadedCommitCount(50, true)).toBe("50+");
	});

	test("uses the exact count when loading has reached its cap", () => {
		expect(getLoadedCommitCount(500, false)).toBe("500");
	});
});
