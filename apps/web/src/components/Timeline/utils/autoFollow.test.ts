import { expect, test } from "bun:test";
import { isNearTimelineBottom } from "./autoFollow";

test("treats the bottom and a small distance from it as following", () => {
	expect(
		isNearTimelineBottom({
			scrollTop: 900,
			clientHeight: 100,
			scrollHeight: 1_000,
		}),
	).toBe(true);
	expect(
		isNearTimelineBottom({
			scrollTop: 860,
			clientHeight: 100,
			scrollHeight: 1_000,
		}),
	).toBe(true);
});

test("stops following once the reader scrolls away from the latest message", () => {
	expect(
		isNearTimelineBottom({
			scrollTop: 800,
			clientHeight: 100,
			scrollHeight: 1_000,
		}),
	).toBe(false);
});
