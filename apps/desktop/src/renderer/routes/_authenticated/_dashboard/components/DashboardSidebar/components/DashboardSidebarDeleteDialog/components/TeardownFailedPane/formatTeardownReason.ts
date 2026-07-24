import type { TeardownFailureCause } from "@superset/host-service";
import { TEARDOWN_TIMEOUT_MS } from "@superset/shared/constants";
import type { MessageKey } from "renderer/providers/I18nProvider/messages";

/** Semantic key + interpolation params for the dialog title when teardown fails. */
export interface TeardownReasonResult {
	key: MessageKey;
	values?: Record<string, number | string>;
}

/** Returns a semantic key (plus optional params) for the caller to translate. */
export function formatTeardownReason(
	cause: TeardownFailureCause,
): TeardownReasonResult {
	if (cause.timedOut) {
		return {
			key: "workspace.teardownTimedOut",
			values: { seconds: Math.round(TEARDOWN_TIMEOUT_MS / 1000) },
		};
	}
	if (cause.exitCode != null) {
		return {
			key: "workspace.teardownExitedWithCode",
			values: { code: cause.exitCode },
		};
	}
	if (cause.signal != null) {
		return {
			key: "workspace.teardownTerminatedBySignal",
			values: { signal: cause.signal },
		};
	}
	return { key: "workspace.teardownFailedToStart" };
}
