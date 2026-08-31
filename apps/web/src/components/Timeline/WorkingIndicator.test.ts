import { expect, test } from "bun:test";
import {
	getWorkingIndicatorDuration,
	getWorkingIndicatorLabel,
} from "./WorkingIndicator";

test("asks for a response while an AskUser request is pending", () => {
	expect(
		getWorkingIndicatorLabel({
			awaitingPermission: true,
			awaitingResponse: true,
		}),
	).toBe("Waiting for your response");
});

test("asks for approval while an ordinary permission is pending", () => {
	expect(
		getWorkingIndicatorLabel({
			awaitingPermission: true,
			awaitingResponse: false,
		}),
	).toBe("Waiting for your approval");
});

test("shows the current turn elapsed time beside Working", () => {
	expect(
		getWorkingIndicatorDuration({
			startedAt: 1_000,
			now: 66_000,
		}),
	).toBe("1m 5s");
	expect(
		getWorkingIndicatorDuration({
			startedAt: null,
			now: 66_000,
		}),
	).toBeNull();
});
