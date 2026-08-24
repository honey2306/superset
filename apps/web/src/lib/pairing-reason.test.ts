import { expect, test } from "bun:test";
import { isRevokedPairingReason } from "./pairing-reason";

test("recognizes revocation feedback from browser navigation state or query", () => {
	expect(
		isRevokedPairingReason(new URLSearchParams("reason=revoked"), null),
	).toBe(true);
	expect(
		isRevokedPairingReason(new URLSearchParams(), { reason: "revoked" }),
	).toBe(true);
	expect(
		isRevokedPairingReason(new URLSearchParams(), { reason: "expired" }),
	).toBe(false);
});
