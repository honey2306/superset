import { describe, expect, test } from "bun:test";
import { isAllowedBareRequire } from "./validate-native-runtime";

describe("isAllowedBareRequire", () => {
	test("accepts node-prefixed builtins unknown to the host builtin list", () => {
		expect(isAllowedBareRequire("node:sqlite")).toBe(true);
	});

	test("does not allow arbitrary external package requires", () => {
		expect(isAllowedBareRequire("not-a-node-builtin")).toBe(false);
		expect(isAllowedBareRequire("@superset/not-an-allowlisted-package")).toBe(
			false,
		);
	});
});
