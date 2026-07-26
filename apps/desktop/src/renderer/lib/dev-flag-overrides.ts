/**
 * Prefix for local-dev feature-flag overrides stored in `localStorage`.
 * Setting `localStorage["superset:debug:<flag-key>"] = "1"` turns the
 * `FEATURE_FLAGS` entry `<flag-key>` on in local dev (where the PostHog
 * key is `phc_local_dev_disabled` and `useFeatureFlagEnabled` would
 * otherwise always return false). Consumed by `initPostHog`, which feeds
 * the result into `posthog.featureFlags.override(...)`.
 */
export const DEV_FLAG_OVERRIDE_PREFIX = "superset:debug:";

/**
 * Collect local-dev feature-flag overrides from a key/value store.
 *
 * Returns `{ [flagKey]: true }` for every key of the form
 * `${prefix}<flagKey>` whose stored value is exactly `"1"`. Other values,
 * missing values, and keys without the prefix are ignored.
 *
 * Pure: takes the key list and a getter so it does not depend on a DOM
 * `localStorage` (bun test does not provide one). `initPostHog` passes
 * `localStorage`'s keys + `getItem`.
 */
export function collectDevFlagOverrides(
	keys: readonly string[],
	getValue: (key: string) => string | null,
	prefix: string,
): Record<string, true> {
	const overrides: Record<string, true> = {};
	for (const key of keys) {
		if (!key.startsWith(prefix)) continue;
		if (getValue(key) !== "1") continue;
		const flagKey = key.slice(prefix.length);
		if (!flagKey) continue;
		overrides[flagKey] = true;
	}
	return overrides;
}
