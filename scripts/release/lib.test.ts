import { describe, expect, test } from "bun:test";
import {
	incrementPatch,
	isPlainRelease,
	latestReleaseTag,
	unifiedErrors,
} from "./lib.ts";

describe("unifiedErrors", () => {
	const check = (d: string, vs: string[]) =>
		unifiedErrors(
			d,
			vs.map((v, i) => ({ name: `p${i}`, version: v })),
		);
	test("release state: host == desktop", () => {
		expect(check("1.14.1", ["1.14.1"])).toEqual([]);
	});
	test("rejects a package ahead of desktop", () => {
		expect(check("1.14.1", ["1.14.2"]).length).toBeGreaterThan(0);
	});
	test("rejects a prerelease suffix (fails the host floor)", () => {
		expect(check("1.14.1", ["1.14.2-1", "1.14.2-1"]).length).toBeGreaterThan(0);
	});
	test("rejects a package below desktop", () => {
		expect(check("1.14.1", ["1.14.0", "1.14.0"]).length).toBeGreaterThan(0);
	});
	test("rejects a different minor line", () => {
		expect(check("1.14.1", ["1.15.0", "1.15.0"]).length).toBeGreaterThan(0);
	});
	test("rejects packages that disagree", () => {
		expect(check("1.14.1", ["1.14.2", "1.14.3"]).length).toBeGreaterThan(0);
	});
	test("desktop must be a plain release", () => {
		expect(check("1.14.1-1", ["1.14.1-1"]).length).toBeGreaterThan(0);
	});
});

describe("latestReleaseTag", () => {
	test("ignores malformed historical tags and picks newest", () => {
		const tags = [
			"desktop-vdesktop-v0.0.14",
			"desktop-v1.13.1",
			"desktop-v1.14.0",
			"desktop-vdesktop-0.0.33",
		];
		expect(latestReleaseTag(tags)).toBe("desktop-v1.14.0");
	});
	test("no matching tags -> undefined", () => {
		expect(latestReleaseTag(["random", "v1.0.0"])).toBeUndefined();
	});
});

describe("helpers", () => {
	test("isPlainRelease", () => {
		expect(isPlainRelease("1.14.0")).toBe(true);
		expect(isPlainRelease("1.14.0-1")).toBe(false);
	});
	test("incrementPatch", () => {
		expect(incrementPatch("0.2.5")).toBe("0.2.6");
	});
});
