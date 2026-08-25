import { expect, test } from "bun:test";
import {
	createPhoneRouteCache,
	getPhonePairingCacheKey,
} from "./phoneRouteCache";

const firstPairing = {
	hostId: "host-1",
	sessionId: "phone-session-1",
	relayMailboxId: "mailbox-1",
};

const secondPairing = {
	hostId: "host-2",
	sessionId: "phone-session-2",
	relayMailboxId: "mailbox-2",
};

test("scopes catalog and workspace values to the active phone pairing", () => {
	const cache = createPhoneRouteCache<{ name: string }>();
	const firstKey = getPhonePairingCacheKey(firstPairing);
	const secondKey = getPhonePairingCacheKey(secondPairing);

	cache.activate(firstKey);
	cache.set("catalog", { name: "first host" });
	cache.set("workspace-1", { name: "first workspace" });
	cache.activate(secondKey);

	expect(cache.get("catalog")).toBeUndefined();
	expect(cache.get("workspace-1")).toBeUndefined();

	cache.set("catalog", { name: "second host" });
	cache.activate(firstKey);
	expect(cache.get("catalog")).toBeUndefined();
});

test("keeps successful values when a caller's refresh fails", () => {
	const cache = createPhoneRouteCache<{ sessions: string[] }>();
	const key = getPhonePairingCacheKey(firstPairing);

	cache.activate(key);
	cache.set("workspace-1", { sessions: ["old-session"] });
	// A failed refresh is represented by no cache write; the last good value
	// must remain available for the route to render while it retries.

	expect(cache.get("workspace-1")).toEqual({ sessions: ["old-session"] });
});

test("clears values when the phone forgets its pairing", () => {
	const cache = createPhoneRouteCache<{ name: string }>();
	const key = getPhonePairingCacheKey(firstPairing);

	cache.activate(key);
	cache.set("catalog", { name: "cached" });
	cache.clear();

	expect(cache.get("catalog")).toBeUndefined();
	expect(cache.activeKey()).toBeNull();
});
