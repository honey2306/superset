import { describe, expect, test } from "bun:test";
import { formatDelegationRunElapsed } from "./formatDelegationRun";

const run = (
	overrides: Partial<Parameters<typeof formatDelegationRunElapsed>[0]> = {},
) => ({
	status: "completed",
	createdAt: 1_000,
	startedAt: 2_000,
	updatedAt: 12_000,
	...overrides,
});

describe("formatDelegationRunElapsed", () => {
	test("uses updatedAt for terminal runs without a completion timestamp", () => {
		expect(
			formatDelegationRunElapsed(
				run({ status: "cancelled", updatedAt: 62_000 }),
				10_000_000,
			),
		).toBe("1m 0s");
	});

	test("keeps active runs live against the current clock", () => {
		expect(formatDelegationRunElapsed(run({ status: "running" }), 65_000)).toBe(
			"1m 3s",
		);
	});
});
