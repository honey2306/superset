export const TERMINAL_BUFFER_KEY_PREFIX = "terminal-buffer:";
export const TERMINAL_DIMS_KEY_PREFIX = "terminal-dims:";
export const TERMINAL_PERSISTED_AT_KEY = "terminal-buffer-persisted-at";

const MAX_PERSISTED_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_TOTAL_BUFFER_CHARS = 2_000_000;
const QUOTA_PRESSURE_AGE_MS = 24 * 60 * 60 * 1000;

type PersistedAtIndex = Record<string, number>;

function readIndex(storage: Storage): PersistedAtIndex {
	try {
		const raw = storage.getItem(TERMINAL_PERSISTED_AT_KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : {};
		if (typeof parsed !== "object" || parsed === null) return {};
		return Object.fromEntries(
			Object.entries(parsed).filter(
				(entry): entry is [string, number] => typeof entry[1] === "number",
			),
		);
	} catch {
		return {};
	}
}

function writeIndex(storage: Storage, index: PersistedAtIndex): void {
	try {
		storage.setItem(TERMINAL_PERSISTED_AT_KEY, JSON.stringify(index));
	} catch {}
}

function collectTerminalIds(storage: Storage): Set<string> {
	const ids = new Set<string>();
	for (let i = 0; i < storage.length; i++) {
		const key = storage.key(i);
		if (key?.startsWith(TERMINAL_BUFFER_KEY_PREFIX)) {
			ids.add(key.slice(TERMINAL_BUFFER_KEY_PREFIX.length));
		} else if (key?.startsWith(TERMINAL_DIMS_KEY_PREFIX)) {
			ids.add(key.slice(TERMINAL_DIMS_KEY_PREFIX.length));
		}
	}
	return ids;
}

function removeTerminalState(storage: Storage, terminalId: string): number {
	let removed = 0;
	try {
		for (const key of [
			`${TERMINAL_BUFFER_KEY_PREFIX}${terminalId}`,
			`${TERMINAL_DIMS_KEY_PREFIX}${terminalId}`,
		]) {
			if (storage.getItem(key) !== null) {
				storage.removeItem(key);
				removed++;
			}
		}
	} catch {}
	return removed;
}

export function touchTerminalStatePersistedAt(
	terminalId: string,
	storage: Storage = localStorage,
	now = Date.now(),
): void {
	const index = readIndex(storage);
	index[terminalId] = now;
	writeIndex(storage, index);
}

export function removeTerminalStatePersistedAt(
	terminalId: string,
	storage: Storage = localStorage,
): void {
	const index = readIndex(storage);
	if (!(terminalId in index)) return;
	delete index[terminalId];
	writeIndex(storage, index);
}

export function reclaimTerminalStateForQuota(
	storage: Storage = localStorage,
	now = Date.now(),
): number {
	try {
		const index = readIndex(storage);
		let removed = 0;
		for (const id of collectTerminalIds(storage)) {
			if (index[id] !== undefined && now - index[id] <= QUOTA_PRESSURE_AGE_MS)
				continue;
			removed += removeTerminalState(storage, id);
			delete index[id];
		}
		if (removed > 0) writeIndex(storage, index);
		return removed;
	} catch {
		return 0;
	}
}

export function clearAllTerminalState(storage: Storage = localStorage): number {
	try {
		let removed = 0;
		for (const id of collectTerminalIds(storage))
			removed += removeTerminalState(storage, id);
		storage.removeItem(TERMINAL_PERSISTED_AT_KEY);
		return removed;
	} catch {
		return 0;
	}
}

export function pruneExpiredTerminalState(
	storage: Storage = localStorage,
	now = Date.now(),
): void {
	try {
		const index = readIndex(storage);
		const ids = collectTerminalIds(storage);
		const survivors: Array<{ id: string; persistedAt: number }> = [];
		for (const id of ids) {
			const persistedAt = index[id];
			if (
				persistedAt === undefined ||
				now - persistedAt > MAX_PERSISTED_AGE_MS
			) {
				removeTerminalState(storage, id);
				delete index[id];
			} else survivors.push({ id, persistedAt });
		}
		survivors.sort((a, b) => b.persistedAt - a.persistedAt);
		let totalChars = 0;
		for (const { id } of survivors) {
			totalChars +=
				storage.getItem(`${TERMINAL_BUFFER_KEY_PREFIX}${id}`)?.length ?? 0;
			if (totalChars > MAX_TOTAL_BUFFER_CHARS) {
				removeTerminalState(storage, id);
				delete index[id];
			}
		}
		for (const id of Object.keys(index)) if (!ids.has(id)) delete index[id];
		writeIndex(storage, index);
	} catch {}
}
