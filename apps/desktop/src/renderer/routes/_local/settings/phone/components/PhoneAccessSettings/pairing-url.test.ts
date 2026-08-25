import { describe, expect, test } from "bun:test";
import { buildAutoMatePairingUrl } from "./pairing-url";

describe("buildAutoMatePairingUrl", () => {
	test("stores encoded credentials in the route AutoMate preserves", () => {
		const url = new URL(buildAutoMatePairingUrl("AB/CD?EF", "mail box/1"));

		expect(url.searchParams.get("route")).toBe(
			"/pair/AB%2FCD%3FEF/mail%20box%2F1",
		);
		expect(url.searchParams.get("v")).toBe("acp3");
		expect(url.searchParams.has("code")).toBeFalse();
		expect(url.searchParams.has("mailboxId")).toBeFalse();
	});
});
