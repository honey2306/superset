import { expect, test } from "bun:test";
import { getPairingErrorMessage } from "./pairing-error";

test("maps relay implementation failures to actionable pairing copy", () => {
	const message = getPairingErrorMessage(
		new Error("await is only valid in async functions [<isolated-vm>:166:11]"),
	);

	expect(message).toBe(
		"The pairing service is temporarily unavailable. Check your connection and try again.",
	);
	expect(message).not.toContain("isolated-vm");
});

test("keeps useful pairing validation guidance without exposing infrastructure errors", () => {
	expect(
		getPairingErrorMessage(new Error("Pairing code is invalid or has expired")),
	).toBe(
		"This pairing code is invalid or has expired. Generate a new code on desktop.",
	);
	expect(getPairingErrorMessage(new Error("Too many pairing attempts"))).toBe(
		"Too many pairing attempts. Wait a minute and try again.",
	);
});

test("uses generic copy for unknown errors", () => {
	expect(getPairingErrorMessage(new Error("secret database details"))).toBe(
		"Pairing failed. Check the code and try again.",
	);
});
