import { describe, expect, test } from "bun:test";
import {
	HOST_SERVICE_RESPAWN_MAX_ATTEMPTS,
	nextRespawnDelayMs,
} from "./host-service-respawn";

describe("nextRespawnDelayMs", () => {
	test("uses exponential backoff with bounded symmetric jitter", () => {
		expect(nextRespawnDelayMs(0, 0)).toBe(500);
		expect(nextRespawnDelayMs(1, 1)).toBe(1_500);
		expect(nextRespawnDelayMs(4, 0.5)).toBe(8_000);
	});

	test("stops scheduling after the retry budget", () => {
		expect(nextRespawnDelayMs(HOST_SERVICE_RESPAWN_MAX_ATTEMPTS)).toBeNull();
	});
});
