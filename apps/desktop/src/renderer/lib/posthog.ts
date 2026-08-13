import { setDirectSocketTelemetry } from "@superset/workspace-client";
import posthogFull from "posthog-js/dist/module.full.no-external";
import type { PostHog } from "posthog-js/react";
import { env } from "../env.renderer";
import {
	collectDevFlagOverrides,
	DEV_FLAG_OVERRIDE_PREFIX,
} from "./dev-flag-overrides";

// Cast to standard PostHog type for compatibility with posthog-js/react
export const posthog = posthogFull as unknown as PostHog;

/**
 * Local-dev PostHog key marker. When the configured key is this sentinel,
 * PostHog is disabled in dev (no server-side flags), so
 * `useFeatureFlagEnabled` would always return false. In that case we feed
 * any `localStorage["superset:debug:<flag>"]="1"` overrides into
 * `posthog.featureFlags.override(...)` so a developer (or the CDP
 * validation script) can turn a feature flag on without PostHog access.
 */
const LOCAL_DEV_POSTHOG_KEY = "phc_local_dev_disabled";

export function initPostHog() {
	if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
		console.log("[posthog] No key configured, skipping");
		return;
	}

	posthogFull.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
		api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
		defaults: "2025-11-30",
		capture_pageview: false,
		capture_pageleave: false,
		capture_exceptions: true,
		person_profiles: "always",
		persistence: "localStorage",
		debug: false,
	});

	posthogFull.register({
		app_name: "desktop",
		// Event-level version (person-profile desktop_version reflects the
		// current install, not the build that emitted a given event).
		app_version: window.App?.appVersion,
		platform: window.navigator.platform,
	});

	// Local-dev flag overrides: in dev the PostHog key is the disabled
	// sentinel, so server-side flags never load. Honor any
	// `localStorage["superset:debug:<flag>"]="1"` entry by overriding the
	// flag on the PostHog client so local validation and dev toggles work.
	if (env.NEXT_PUBLIC_POSTHOG_KEY === LOCAL_DEV_POSTHOG_KEY) {
		const keys: string[] = [];
		for (let i = 0; i < window.localStorage.length; i++) {
			const key = window.localStorage.key(i);
			if (key) keys.push(key);
		}
		const overrides = collectDevFlagOverrides(
			keys,
			(k) => window.localStorage.getItem(k),
			DEV_FLAG_OVERRIDE_PREFIX,
		);
		// Always replace the override map. Skipping the empty case leaves a
		// previous in-memory override enabled after its localStorage key is
		// removed, which makes flag-off validation (and normal dev toggling)
		// impossible until the Electron process restarts.
		posthogFull.featureFlags.override(overrides);
	}

	// Direct host socket health (event bus / workspace "disconnected" surface).
	// At most one event per outage episode plus one on recovery.
	setDirectSocketTelemetry((event) => {
		posthogFull.capture(`direct_ws_${event.kind}`, {
			socket_name: event.socketName,
			endpoint: event.endpoint,
			close_code: event.closeCode,
			close_reason: event.closeReason,
			reconnect_attempts: event.failedAttempts,
			outage_ms: event.outageMs,
		});
	});
}
