import { expect, test } from "bun:test";
import {
	createPhoneRouteCache,
	getPhonePairingCacheKey,
	getPhoneRouteCacheStorageKey,
	type PhoneSnapshotCacheValue,
	parsePhoneSnapshotCacheValue,
	projectPhoneSnapshotCacheValue,
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

class MemoryStorage implements Storage {
	private readonly values = new Map<string, string>();

	get length(): number {
		return this.values.size;
	}

	clear(): void {
		this.values.clear();
	}

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	key(index: number): string | null {
		return [...this.values.keys()][index] ?? null;
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}
}

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

test("persists and hydrates values only when persistence is explicitly enabled", () => {
	const storage = new MemoryStorage();
	const key = getPhonePairingCacheKey(firstPairing);
	const persistence = {
		storage,
		now: () => 1_000,
	};
	const persistentCache = createPhoneRouteCache<{ name: string }>({
		persistence,
	});

	persistentCache.activate(key);
	persistentCache.set("catalog", { name: "cached" });

	const hydratedCache = createPhoneRouteCache<{ name: string }>({
		persistence,
	});
	hydratedCache.activate(key);
	const memoryOnlyCache = createPhoneRouteCache<{ name: string }>();
	memoryOnlyCache.activate(key);

	expect(hydratedCache.get("catalog")).toEqual({ name: "cached" });
	expect(memoryOnlyCache.get("catalog")).toBeUndefined();
});

test("deletes expired and corrupted persisted values before hydration", () => {
	const storage = new MemoryStorage();
	const key = getPhonePairingCacheKey(firstPairing);
	const storageKey = getPhoneRouteCacheStorageKey(key ?? "");
	const persistence = { storage, now: () => 24 * 60 * 60 * 1000 };

	storage.setItem(
		storageKey,
		JSON.stringify({
			version: 1,
			cachedAt: 0,
			values: { catalog: { name: "expired" } },
		}),
	);
	const expiredCache = createPhoneRouteCache<{ name: string }>({
		persistence,
	});
	expiredCache.activate(key);

	expect(expiredCache.get("catalog")).toBeUndefined();
	expect(storage.getItem(storageKey)).toBeNull();

	storage.setItem(storageKey, "not-json");
	const corruptCache = createPhoneRouteCache<{ name: string }>({
		persistence,
	});
	corruptCache.activate(key);

	expect(corruptCache.get("catalog")).toBeUndefined();
	expect(storage.getItem(storageKey)).toBeNull();
});

test("persists only the phone home projection", () => {
	const storage = new MemoryStorage();
	const key = getPhonePairingCacheKey(firstPairing);
	const value = {
		catalog: {
			schemaVersion: 2,
			revision: 9,
			projects: [
				{
					id: "project-1",
					name: "Project",
					repoPath: "/Users/wufan/Code/project",
					repoUrl: "https://example.invalid",
				},
			],
			workspaces: [
				{
					id: "workspace-1",
					projectId: "project-1",
					name: "Workspace",
					branch: "main",
					worktreePath: "/Users/wufan/Code/project",
				},
			],
		},
		acp: {
			enabled: true,
			items: [
				{
					sessionId: "session-1",
					workspaceId: "workspace-1",
					title: "Recent",
					status: "idle" as const,
					updatedAt: 20,
					pendingPermissions: [{ requestId: "secret" }],
					cwd: "/private",
					lastError: "secret error",
					prompt: "secret prompt",
					bearer: "secret bearer",
				},
			],
		},
	} satisfies PhoneSnapshotCacheValue;
	const cache = createPhoneRouteCache<PhoneSnapshotCacheValue>({
		persistence: {
			storage,
			serialize: projectPhoneSnapshotCacheValue,
			deserialize: parsePhoneSnapshotCacheValue,
			now: () => 1_000,
		},
	});

	cache.activate(key);
	cache.set("catalog", value);
	const stored = storage.getItem(getPhoneRouteCacheStorageKey(key ?? ""));

	expect(stored).toContain("project-1");
	expect(stored).toContain("session-1");
	expect(stored).not.toContain("/Users/wufan");
	expect(stored).not.toContain("bearer");
	expect(stored).not.toContain("cwd");
	expect(stored).not.toContain("pendingPermissions");
	expect(stored).not.toContain("secret");
	const hydrated = createPhoneRouteCache<PhoneSnapshotCacheValue>({
		persistence: {
			storage,
			now: () => 1_000,
			deserialize: parsePhoneSnapshotCacheValue,
		},
	});
	hydrated.activate(key);
	expect(hydrated.get("catalog")).toEqual({
		catalog: {
			schemaVersion: 2,
			revision: 9,
			projects: [{ id: "project-1", name: "Project", repoPath: "project" }],
			workspaces: [
				{
					id: "workspace-1",
					projectId: "project-1",
					name: "Workspace",
					branch: "main",
				},
			],
		},
		acp: {
			enabled: true,
			items: [
				{
					sessionId: "session-1",
					workspaceId: "workspace-1",
					title: "Recent",
					status: "idle",
					updatedAt: 20,
				},
			],
		},
	});
});

test("isolates persisted values by pairing and removes only the active pairing", () => {
	const storage = new MemoryStorage();
	const persistence = { storage, now: () => 1_000 };
	const firstKey = getPhonePairingCacheKey(firstPairing);
	const secondKey = getPhonePairingCacheKey(secondPairing);
	const cache = createPhoneRouteCache<{ name: string }>({ persistence });

	cache.activate(firstKey);
	cache.set("catalog", { name: "first" });
	cache.activate(secondKey);
	cache.set("catalog", { name: "second" });

	const firstHydrated = createPhoneRouteCache<{ name: string }>({
		persistence,
	});
	firstHydrated.activate(firstKey);
	const secondHydrated = createPhoneRouteCache<{ name: string }>({
		persistence,
	});
	secondHydrated.activate(secondKey);

	expect(firstHydrated.get("catalog")).toEqual({ name: "first" });
	expect(secondHydrated.get("catalog")).toEqual({ name: "second" });
	firstHydrated.clear();
	expect(
		storage.getItem(getPhoneRouteCacheStorageKey(firstKey ?? "")),
	).toBeNull();
	expect(
		storage.getItem(getPhoneRouteCacheStorageKey(secondKey ?? "")),
	).not.toBeNull();
});
