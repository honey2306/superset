import { describe, expect, it } from "bun:test";
import { toSendFailureMessage } from "./sendMessage";

const stubT = (key: string) => {
	if (key === "chat.error.authFailed")
		return "Model authentication failed. Reconnect OAuth or set an API key in the model picker, then retry.";
	if (key === "chat.error.sendFailed") return "Failed to send message";
	return key;
};

describe("toSendFailureMessage", () => {
	it("maps auth failures when status is 401/403", () => {
		expect(toSendFailureMessage({ status: 401 }, stubT)).toBe(
			"Model authentication failed. Reconnect OAuth or set an API key in the model picker, then retry.",
		);
		expect(toSendFailureMessage({ response: { status: 403 } }, stubT)).toBe(
			"Model authentication failed. Reconnect OAuth or set an API key in the model picker, then retry.",
		);
	});

	it("keeps backend message when status is not auth-related", () => {
		expect(
			toSendFailureMessage(
				new Error("Unauthorized model provider token, please reconnect OAuth"),
				stubT,
			),
		).toBe("Unauthorized model provider token, please reconnect OAuth");
	});
});
