import { describe, expect, test } from "bun:test";
import { collectDevFlagOverrides } from "./dev-flag-overrides";

/**
 * `collectDevFlagOverrides` powers the local-dev feature-flag override so a
 * developer (or the CDP validation script) can turn a `FEATURE_FLAGS` entry
 * on without PostHog server access: set
 * `localStorage["superset:debug:<flag-key>"] = "1"`. The local dev PostHog
 * key is `phc_local_dev_disabled`, so `useFeatureFlagEnabled` would
 * otherwise always return false; this override feeds
 * `posthog.featureFlags.override(...)` in `initPostHog`.
 *
 * Pure: takes the key list + a getter (so it does not depend on a DOM
 * `localStorage`, which bun test does not provide).
 */
describe("collectDevFlagOverrides", () => {
	test('returns {flag: true} for a superset:debug:<flag>="1" entry', () => {
		const overrides = collectDevFlagOverrides(
			["superset:debug:v2-panes-in-v1"],
			(_k) => "1",
			"superset:debug:",
		);
		expect(overrides).toEqual({ "v2-panes-in-v1": true });
	});

	test('ignores entries not equal to "1"', () => {
		const overrides = collectDevFlagOverrides(
			["superset:debug:v2-panes-in-v1"],
			() => "0",
			"superset:debug:",
		);
		expect(overrides).toEqual({});
	});

	test("ignores entries without the prefix", () => {
		const overrides = collectDevFlagOverrides(
			["other-key", "superset:debug:v2-panes-in-v1"],
			(k) => (k === "superset:debug:v2-panes-in-v1" ? "1" : "1"),
			"superset:debug:",
		);
		expect(overrides).toEqual({ "v2-panes-in-v1": true });
	});

	test("handles null values from the getter", () => {
		const overrides = collectDevFlagOverrides(
			["superset:debug:missing"],
			() => null,
			"superset:debug:",
		);
		expect(overrides).toEqual({});
	});

	test("collects multiple flags", () => {
		const overrides = collectDevFlagOverrides(
			[
				"superset:debug:v2-panes-in-v1",
				"superset:debug:v1-host-service-terminal",
			],
			() => "1",
			"superset:debug:",
		);
		expect(overrides).toEqual({
			"v2-panes-in-v1": true,
			"v1-host-service-terminal": true,
		});
	});
});
