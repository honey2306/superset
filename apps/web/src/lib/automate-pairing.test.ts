import { describe, expect, test } from "bun:test";
import {
	getAutoMatePairingHashParams,
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
});
