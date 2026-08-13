import { describe, expect, test } from "bun:test";
import { defineEnv } from "./helpers";

describe("defineEnv", () => {
	test("uses the fallback when an environment variable is empty", () => {
		expect(defineEnv("", "https://example.com")).toBe(
			JSON.stringify("https://example.com"),
		);
	});
});
