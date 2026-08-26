import { describe, expect, test } from "bun:test";
import type { StoredSession } from "./auth-store";
import {
	decodeAutoMateResumeSession,
	encodeAutoMateResumeSession,
	getAutoMateCleanPairPath,
	getAutoMatePairSuccessPath,
	getAutoMateResumeUrl,
} from "./automate-resume";

const session: StoredSession = {
	token: "phone-bearer-secret",
	sessionId: "session-1",
	hostName: "MacBook Pro",
	hostId: "host-1",
	expiresAt: Date.now() + 60_000,
	relayMailboxId: "mailbox-1",
};

describe("AutoMate resume routes", () => {
	test("encodes a paired session into a versioned fragment refresh URL", () => {
		const url = new URL(getAutoMateResumeUrl(session), "https://example.test");
		expect(url.pathname).toBe("/webapp/16740");
		expect(url.searchParams.get("v")).toBe("acp3");
		expect(url.search).toBe("?v=acp3");
		expect(url.hash).toStartWith("#/r/");
		expect(url.toString()).not.toContain(session.token);
		expect(decodeAutoMateResumeSession(url.hash)).toEqual(session);
	});

	test("keeps subroutes in the hash without changing the platform request", () => {
		const url = new URL(getAutoMateResumeUrl(session), "https://example.test");
		url.hash = `${url.hash}/w/workspace/s/session`;
		expect(url.pathname).toBe("/webapp/16740");
		expect(url.searchParams.get("v")).toBe("acp3");
		expect(url.search).toBe("?v=acp3");
		expect(url.hash).toMatch(/^#\/r\/.+\/w\/workspace\/s\/session$/);
	});

	test("rejects malicious and expired fragment payloads", () => {
		expect(decodeAutoMateResumeSession("#/r/not-base64/../../pair")).toBeNull();
		const valid = new URL(
			getAutoMateResumeUrl(session),
			"https://example.test",
		);
		expect(decodeAutoMateResumeSession(`${valid.hash}/../../pair`)).toBeNull();
		const expiredSession = {
			...session,
			expiresAt: Date.now() - 1,
		};
		const expired = encodeAutoMateResumeSession(expiredSession);
		expect(decodeAutoMateResumeSession(`#/r/${expired}`)).toBeNull();
		expect(
			decodeAutoMateResumeSession(`#/r/${expired}`, { allowExpired: true }),
		).toEqual(expiredSession);
	});

	test("returns a clean fragment pair route that removes the bearer", () => {
		expect(getAutoMateCleanPairPath("/webapp/16740")).toBe(
			"/webapp/16740?v=acp3#/pair",
		);
		expect(getAutoMateCleanPairPath("/app/w/workspace")).toBe("/app/pair");
	});

	test("uses a full hard-navigation destination only for AutoMate pairing", () => {
		expect(getAutoMatePairSuccessPath(session, true)).toBe(
			getAutoMateResumeUrl(session),
		);
		expect(getAutoMatePairSuccessPath(session, false)).toBeNull();
	});
});
