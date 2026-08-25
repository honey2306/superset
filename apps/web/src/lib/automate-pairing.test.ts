import { describe, expect, test } from "bun:test";
import {
	canRedeemPairing,
	getAutoMatePairingHashParams,
	getAutoMatePairingMailboxId,
	getAutoMatePairingPathParams,
	getPairingCredentials,
} from "./automate-pairing";

describe("AutoMate pairing credentials", () => {
	test("parses credentials embedded in the route AutoMate preserves", () => {
		const pathParams = getAutoMatePairingPathParams(
			"/webapp/16740/pair/AB%2FCD%3FEF/mail%20box%2F1",
		);

		expect(pathParams).toEqual({
			code: "AB/CD?EF",
			mailboxId: "mail box/1",
		});
		expect(getPairingCredentials(new URLSearchParams(), pathParams)).toEqual({
			code: "AB/CD?EF",
			mailboxId: "mail box/1",
		});
	});

	test("keeps direct and legacy AutoMate query links working", () => {
		expect(
			getPairingCredentials(
				new URLSearchParams("code=QUERY-CODE&mailboxId=query-mailbox"),
				{ code: "PATH-CODE", mailboxId: "path-mailbox" },
			),
		).toEqual({ code: "QUERY-CODE", mailboxId: "query-mailbox" });
	});

	test("parses pairing credentials from the AutoMate fragment route", () => {
		expect(
			getAutoMatePairingHashParams("#/pair/AB%2FCD%3FEF/mail%20box%2F1"),
		).toEqual({ code: "AB/CD?EF", mailboxId: "mail box/1" });
		expect(getAutoMatePairingHashParams("#/pair/code")).toEqual({});
	});

	test("rejects malformed or unrelated paths", () => {
		expect(getAutoMatePairingPathParams("/webapp/16740/pair/code")).toEqual({});
		expect(getAutoMatePairingPathParams("/app/pair/code/mailbox")).toEqual({});
	});

	test("preserves a stored AutoMate mailbox when the generic pair route loses it", () => {
		expect(
			getAutoMatePairingMailboxId({
				isAutoMateWebApp: true,
				storedMailboxId: "old-mailbox",
			}),
		).toBe("old-mailbox");
	});

	test("prefers the mailbox embedded in the current AutoMate pairing link", () => {
		expect(
			getAutoMatePairingMailboxId({
				isAutoMateWebApp: true,
				routeMailboxId: "route-mailbox",
				storedMailboxId: "old-mailbox",
			}),
		).toBe("route-mailbox");
	});

	test("does not carry relay state into a direct pairing", () => {
		expect(
			getAutoMatePairingMailboxId({
				isAutoMateWebApp: false,
				routeMailboxId: "route-mailbox",
				storedMailboxId: "old-mailbox",
			}),
		).toBeUndefined();
	});

	test("keeps direct pairing available but blocks mailbox-less AutoMate pairing", () => {
		expect(canRedeemPairing({ isAutoMateWebApp: false })).toBeTrue();
		expect(canRedeemPairing({ isAutoMateWebApp: true })).toBeFalse();
		expect(
			canRedeemPairing({
				isAutoMateWebApp: true,
				relayMailboxId: "mailbox-1",
			}),
		).toBeTrue();
	});
});
