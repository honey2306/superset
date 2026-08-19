import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	directReleaseErrors,
	isPublishedRelease,
	shouldUseDirectRelease,
} from "./desktop.ts";

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

describe("direct desktop releases", () => {
	const ready = {
		branch: "main",
		worktreeStatus: "",
		headSha: "abc123",
		originMainSha: "abc123",
		commitInput: "",
		autoMerge: false,
	};

	test("accepts a clean main that exactly matches origin/main", () => {
		expect(directReleaseErrors(ready)).toEqual([]);
	});

	test("uses the solo flow by default on main", () => {
		expect(
			shouldUseDirectRelease({
				branch: "main",
				commitInput: "",
				direct: false,
			}),
		).toBe(true);
	});

	test("uses the PR flow when an exact commit is supplied", () => {
		expect(
			shouldUseDirectRelease({
				branch: "main",
				commitInput: "abc123",
				direct: false,
			}),
		).toBe(false);
	});

	test("rejects PR-only options", () => {
		expect(
			directReleaseErrors({
				...ready,
				commitInput: "def456",
				autoMerge: true,
			}),
		).toEqual([
			"--direct cannot be combined with a commit SHA",
			"--direct does not create a PR, so it cannot use --merge",
		]);
	});

	test("rejects a dirty, non-main, or stale checkout", () => {
		expect(
			directReleaseErrors({
				...ready,
				branch: "feature/release",
				worktreeStatus: " M package.json",
				headSha: "old",
			}),
		).toEqual([
			"--direct must run from main (current branch: feature/release)",
			"--direct requires a clean working tree",
			"local main must exactly match origin/main",
		]);
	});
});
