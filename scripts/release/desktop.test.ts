import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isPublishedRelease } from "./desktop.ts";

describe("desktop release publishing", () => {
	test("identifies only a non-draft release as published", () => {
		expect(isPublishedRelease("false")).toBe(true);
		expect(isPublishedRelease("true")).toBe(false);
	});

	test("keeps --publish as a backward-compatible no-op", () => {
		const source = readFileSync(resolve(import.meta.dir, "desktop.ts"), "utf8");

		expect(source).toContain('arg === "--publish"');
		expect(source).toContain("desktop releases publish by default");
	});
});
