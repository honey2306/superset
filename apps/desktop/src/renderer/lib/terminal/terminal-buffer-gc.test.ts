import { describe, expect, test } from "bun:test";
import {
	clearAllTerminalState,
	pruneExpiredTerminalState,
	reclaimTerminalStateForQuota,
	removeTerminalStatePersistedAt,
	TERMINAL_BUFFER_KEY_PREFIX,
	TERMINAL_DIMS_KEY_PREFIX,
	TERMINAL_PERSISTED_AT_KEY,
	touchTerminalStatePersistedAt,
} from "./terminal-buffer-gc";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function createFakeStorage(): {
	values: Map<string, string>;
	storage: Storage;
} {
	const values = new Map<string, string>();
	const storage = {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key: string) => values.get(key) ?? null,
		key: (index: number) => Array.from(values.keys())[index] ?? null,
		removeItem: (key: string) => values.delete(key),
		setItem: (key: string, value: string) => values.set(key, value),
	} as Storage;
	return { values, storage };
}

function seedTerminal(
	values: Map<string, string>,
	id: string,
	buffer = "scrollback",
) {
	values.set(`${TERMINAL_BUFFER_KEY_PREFIX}${id}`, buffer);
	values.set(
		`${TERMINAL_DIMS_KEY_PREFIX}${id}`,
		JSON.stringify({ cols: 120, rows: 32 }),
	);
}

function readIndex(values: Map<string, string>): Record<string, number> {
	const raw = values.get(TERMINAL_PERSISTED_AT_KEY);
	return raw ? JSON.parse(raw) : {};
}

describe("pruneExpiredTerminalState", () => {
	test("removes legacy state without a timestamp while retaining unrelated keys", () => {
		const { values, storage } = createFakeStorage();
		seedTerminal(values, "legacy");
		values.set("unrelated-key", "kept");
		pruneExpiredTerminalState(storage, NOW);
		expect(values.has(`${TERMINAL_BUFFER_KEY_PREFIX}legacy`)).toBe(false);
		expect(values.has(`${TERMINAL_DIMS_KEY_PREFIX}legacy`)).toBe(false);
		expect(values.get("unrelated-key")).toBe("kept");
	});

	test("keeps fresh entries and removes TTL-expired entries", () => {
		const { values, storage } = createFakeStorage();
		seedTerminal(values, "fresh");
		seedTerminal(values, "stale");
		touchTerminalStatePersistedAt("fresh", storage, NOW - DAY_MS);
		touchTerminalStatePersistedAt("stale", storage, NOW - 15 * DAY_MS);
		pruneExpiredTerminalState(storage, NOW);
		expect(values.has(`${TERMINAL_BUFFER_KEY_PREFIX}fresh`)).toBe(true);
		expect(values.has(`${TERMINAL_BUFFER_KEY_PREFIX}stale`)).toBe(false);
		expect(Object.keys(readIndex(values))).toEqual(["fresh"]);
	});

	test("evicts oldest buffers beyond the aggregate budget", () => {
		const { values, storage } = createFakeStorage();
		const big = "x".repeat(900_000);
		for (const [id, age] of [
			["newest", 1],
			["middle", 2],
			["oldest", 3],
		] as const) {
			seedTerminal(values, id, big);
			touchTerminalStatePersistedAt(id, storage, NOW - age * DAY_MS);
		}
		pruneExpiredTerminalState(storage, NOW);
		expect(values.has(`${TERMINAL_BUFFER_KEY_PREFIX}newest`)).toBe(true);
		expect(values.has(`${TERMINAL_BUFFER_KEY_PREFIX}middle`)).toBe(true);
		expect(values.has(`${TERMINAL_BUFFER_KEY_PREFIX}oldest`)).toBe(false);
	});

	test("drops orphaned index rows and dims-only legacy state", () => {
		const { values, storage } = createFakeStorage();
		seedTerminal(values, "live");
		touchTerminalStatePersistedAt("live", storage, NOW);
		touchTerminalStatePersistedAt("ghost", storage, NOW);
		values.set(`${TERMINAL_DIMS_KEY_PREFIX}dims-only`, "{}");
		pruneExpiredTerminalState(storage, NOW);
		expect(Object.keys(readIndex(values))).toEqual(["live"]);
		expect(values.has(`${TERMINAL_DIMS_KEY_PREFIX}dims-only`)).toBe(false);
	});
});

describe("terminal quota reclamation", () => {
	test("reclaims legacy and old snapshots but preserves fresh snapshots", () => {
		const { values, storage } = createFakeStorage();
		seedTerminal(values, "fresh");
		seedTerminal(values, "old");
		seedTerminal(values, "legacy");
		touchTerminalStatePersistedAt("fresh", storage, NOW - 60_000);
		touchTerminalStatePersistedAt("old", storage, NOW - 2 * DAY_MS);
		expect(reclaimTerminalStateForQuota(storage, NOW)).toBe(4);
		expect(values.has(`${TERMINAL_BUFFER_KEY_PREFIX}fresh`)).toBe(true);
		expect(values.has(`${TERMINAL_BUFFER_KEY_PREFIX}old`)).toBe(false);
		expect(values.has(`${TERMINAL_DIMS_KEY_PREFIX}legacy`)).toBe(false);
	});

	test("clear removes all snapshots and timestamp index but no unrelated state", () => {
		const { values, storage } = createFakeStorage();
		seedTerminal(values, "fresh");
		seedTerminal(values, "legacy");
		touchTerminalStatePersistedAt("fresh", storage, NOW);
		values.set("unrelated", "kept");
		expect(clearAllTerminalState(storage)).toBe(4);
		expect(values.has(TERMINAL_PERSISTED_AT_KEY)).toBe(false);
		expect(values.get("unrelated")).toBe("kept");
	});
});

describe("persisted-at index", () => {
	test("touch and remove maintain the index, including after corrupt data", () => {
		const { values, storage } = createFakeStorage();
		values.set(TERMINAL_PERSISTED_AT_KEY, "not-json");
		touchTerminalStatePersistedAt("t1", storage, NOW);
		expect(readIndex(values)).toEqual({ t1: NOW });
		removeTerminalStatePersistedAt("t1", storage);
		expect(readIndex(values)).toEqual({});
	});
});
