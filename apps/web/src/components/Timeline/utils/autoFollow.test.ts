import { expect, test } from "bun:test";
import { isNearTimelineBottom } from "./autoFollow";

test("treats the bottom and layout rounding near it as following", () => {
	expect(
		isNearTimelineBottom({
			scrollTop: 900,
			clientHeight: 100,
			scrollHeight: 1_000,
		}),
	).toBe(true);
	expect(
		isNearTimelineBottom({
			scrollTop: 893,
			clientHeight: 100,
			scrollHeight: 1_000,
		}),
	).toBe(true);
});

test("stops following after a small intentional upward swipe", () => {
	expect(
		isNearTimelineBottom({
			scrollTop: 888,
			clientHeight: 100,
			scrollHeight: 1_000,
		}),
	).toBe(false);
});
