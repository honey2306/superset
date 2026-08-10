export const HOST_SERVICE_RESPAWN_BASE_DELAY_MS = 1_000;
export const HOST_SERVICE_RESPAWN_MAX_DELAY_MS = 30_000;
/** Eight jittered attempts span roughly 46–108 seconds. */
export const HOST_SERVICE_RESPAWN_MAX_ATTEMPTS = 8;
/** Uptime that resets the respawn budget after a successful recovery. */
export const HOST_SERVICE_RESPAWN_STABLE_MS = 60_000;

/**
 * Return the delay before the next automatic respawn, or null after the retry
 * budget is exhausted. `random` is injectable for deterministic tests.
 */
export function nextRespawnDelayMs(
	attemptsMade: number,
	random: number = Math.random(),
): number | null {
	if (attemptsMade >= HOST_SERVICE_RESPAWN_MAX_ATTEMPTS) return null;
	const step = Math.max(1, attemptsMade);
	const backoff = Math.min(
		HOST_SERVICE_RESPAWN_BASE_DELAY_MS * 2 ** (step - 1),
		HOST_SERVICE_RESPAWN_MAX_DELAY_MS,
	);
	return Math.min(backoff * (0.5 + random), HOST_SERVICE_RESPAWN_MAX_DELAY_MS);
}
