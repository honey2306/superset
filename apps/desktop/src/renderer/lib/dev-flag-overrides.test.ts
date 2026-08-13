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
			["superset:debug:test-feature"],
			(_k) => "1",
			"superset:debug:",
		);
		expect(overrides).toEqual({ "test-feature": true });
	});

	test('ignores entries not equal to "1"', () => {
		const overrides = collectDevFlagOverrides(
			["superset:debug:test-feature"],
			() => "0",
			"superset:debug:",
		);
		expect(overrides).toEqual({});
	});

	test("ignores entries without the prefix", () => {
		const overrides = collectDevFlagOverrides(
			["other-key", "superset:debug:test-feature"],
			(k) => (k === "superset:debug:test-feature" ? "1" : "1"),
			"superset:debug:",
		);
		expect(overrides).toEqual({ "test-feature": true });
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
			["superset:debug:test-feature", "superset:debug:hiring-banner"],
			() => "1",
			"superset:debug:",
		);
		expect(overrides).toEqual({
			"test-feature": true,
			"hiring-banner": true,
		});
	});
});
