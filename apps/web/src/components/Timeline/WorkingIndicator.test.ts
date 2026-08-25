import { expect, test } from "bun:test";
import { getWorkingIndicatorLabel } from "./WorkingIndicator";

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
