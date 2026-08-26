import { beforeEach, describe, expect, test } from "bun:test";
import type { StoredSession } from "./auth-store";
import { getAutoMateResumeUrl } from "./automate-resume";

const backing = new Map<string, string>();
const storage: Storage = {
	get length() {
		return backing.size;
	},
	clear: () => backing.clear(),
	getItem: (key) => backing.get(key) ?? null,
	key: (index) => Array.from(backing.keys())[index] ?? null,
	removeItem: (key) => {
		backing.delete(key);
	},
	setItem: (key, value) => {
		backing.set(key, String(value));
	},
};
Object.defineProperty(globalThis, "localStorage", {
	configurable: true,
	value: storage,
});
Object.defineProperty(globalThis, "location", {
	configurable: true,
	value: { hash: "" },
});

const { clearStoredSession, getStoredSession, setStoredSession } = await import(
	"./auth-store"
);

const session = (relayMailboxId: string): StoredSession => ({
	token: `token-${relayMailboxId}`,
	sessionId: `session-${relayMailboxId}`,
	hostName: "MacBook",
	hostId: "host-1",
	expiresAt: Date.now() + 60_000,
	relayMailboxId,
});

function setResumeHash(session: StoredSession): void {
	location.hash = new URL(
		getAutoMateResumeUrl(session),
		"https://example.test",
	).hash;
}

describe("phone session storage", () => {
	beforeEach(() => {
		backing.clear();
		location.hash = "";
	});

	test("keeps relay sessions for different mailbox environments separately", () => {
		const development = session("superset:org:host:n-development");
		const production = session("superset:org:host");

		setStoredSession(development);
		setStoredSession(production);

		expect(
			storage.getItem(
				`superset.phone.session.v2:${development.relayMailboxId}`,
			),
		).not.toBeNull();
		expect(
			storage.getItem(`superset.phone.session.v2:${production.relayMailboxId}`),
		).not.toBeNull();
	});

	test("continues reading the pre-isolation stable session key", () => {
		const legacy = session("superset:org:host");
		storage.setItem("superset.phone.session.v1", JSON.stringify(legacy));

		expect(getStoredSession()).toEqual(legacy);
	});

	test("clears only the current resume environment and preserves another slot", () => {
		const development = session("superset:org:host:n-development");
		const production = session("superset:org:host");
		setStoredSession(development);
		setStoredSession(production);
		setResumeHash(development);

		clearStoredSession();
		location.hash = "";

		expect(getStoredSession()).toBeNull();
		expect(
			storage.getItem(
				`superset.phone.session.v2:${development.relayMailboxId}`,
			),
		).toBeNull();
		expect(
			storage.getItem(`superset.phone.session.v2:${production.relayMailboxId}`),
		).not.toBeNull();

		setResumeHash(production);
		expect(getStoredSession()).toEqual(production);
	});

	test("expired current sessions do not switch to another environment", () => {
		const expiredDevelopment = {
			...session("superset:org:host:n-development"),
			expiresAt: Date.now() - 1,
		};
		const production = session("superset:org:host");
		setStoredSession(expiredDevelopment);
		setStoredSession(production);
		setResumeHash(expiredDevelopment);

		expect(getStoredSession()).toBeNull();
		location.hash = "";
		expect(getStoredSession()).toBeNull();

		setResumeHash(production);
		expect(getStoredSession()).toEqual(production);

		// A later explicit pairing can reactivate the preserved environment.
		location.hash = "";
		setStoredSession(production);
		expect(getStoredSession()).toEqual(production);
	});
});
