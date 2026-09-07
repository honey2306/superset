import type { SessionStatus } from "@superset/session-protocol";

/**
 * Identity used to scope in-memory mobile route data. The session id is
 * intentionally part of the key: re-pairing the same Mac creates a new phone
 * session and must not briefly render data from the previous pairing.
 */
export type PhonePairingIdentity = {
	hostId: string;
	sessionId: string;
	relayMailboxId?: string;
};

export function getPhonePairingCacheKey(
	session: PhonePairingIdentity | null | undefined,
): string | null {
	if (!session?.hostId || !session.sessionId) return null;
	return JSON.stringify([
		session.hostId,
		session.sessionId,
		session.relayMailboxId ?? "direct",
	]);
}

export type PhoneRouteCache<TValue> = {
	activate: (pairingKey: string | null) => void;
	get: (scope: string) => TValue | undefined;
	set: (scope: string, value: TValue) => void;
	clear: () => void;
	activeKey: () => string | null;
};

export const PHONE_ROUTE_CACHE_STORAGE_VERSION = 1;
export const PHONE_ROUTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** The only fields needed to render the phone home conversation list. */
export type PhoneSnapshotCacheValue = {
	catalog: {
		schemaVersion: number;
		revision: number;
		projects: Array<{
			id: string;
			name: string | null;
			repoPath: string;
		}>;
		workspaces: Array<{
			id: string;
			projectId: string;
			name: string | null;
			branch: string;
		}>;
	};
	acp: {
		enabled: boolean;
		items: Array<{
			sessionId: string;
			workspaceId: string;
			title: string | null;
			status: SessionStatus;
			updatedAt: number;
		}>;
	};
};

function isSessionStatus(value: unknown): value is SessionStatus {
	return (
		value === "starting" ||
		value === "idle" ||
		value === "running" ||
		value === "awaiting_permission" ||
		value === "offline" ||
		value === "dead"
	);
}

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === "string";
}

function pathBasename(path: string): string {
	const trimmed = path.replace(/[\\/]+$/, "");
	const separator = Math.max(
		trimmed.lastIndexOf("/"),
		trimmed.lastIndexOf("\\"),
	);
	return trimmed.slice(separator + 1);
}

function isPhoneSnapshotCacheValue(
	value: unknown,
): value is PhoneSnapshotCacheValue {
	if (!isRecord(value)) return false;
	const catalog = value.catalog;
	const acp = value.acp;
	if (!isRecord(catalog) || !isRecord(acp)) return false;
	if (
		typeof catalog.schemaVersion !== "number" ||
		!Number.isFinite(catalog.schemaVersion) ||
		typeof catalog.revision !== "number" ||
		!Number.isFinite(catalog.revision) ||
		!Array.isArray(catalog.projects) ||
		!Array.isArray(catalog.workspaces) ||
		typeof acp.enabled !== "boolean" ||
		!Array.isArray(acp.items)
	)
		return false;

	return (
		catalog.projects.every(
			(project) =>
				isRecord(project) &&
				typeof project.id === "string" &&
				isNullableString(project.name) &&
				typeof project.repoPath === "string" &&
				project.repoPath === pathBasename(project.repoPath),
		) &&
		catalog.workspaces.every(
			(workspace) =>
				isRecord(workspace) &&
				typeof workspace.id === "string" &&
				typeof workspace.projectId === "string" &&
				isNullableString(workspace.name) &&
				typeof workspace.branch === "string",
		) &&
		acp.items.every(
			(session) =>
				isRecord(session) &&
				typeof session.sessionId === "string" &&
				typeof session.workspaceId === "string" &&
				isNullableString(session.title) &&
				isSessionStatus(session.status) &&
				typeof session.updatedAt === "number" &&
				Number.isFinite(session.updatedAt),
		)
	);
}

/**
 * Rebuild a cache value from the persisted JSON projection. This deliberately
 * rejects every shape that contains no complete renderable projection rather
 * than allowing malformed storage to leak into the route tree.
 */
export function parsePhoneSnapshotCacheValue(
	value: unknown,
): PhoneSnapshotCacheValue | undefined {
	return isPhoneSnapshotCacheValue(value) ? value : undefined;
}

/**
 * Strip a live phoneSnapshot response down to the fields the home route
 * renders before it reaches localStorage.
 */
export function projectPhoneSnapshotCacheValue(
	value: PhoneSnapshotCacheValue,
): PhoneSnapshotCacheValue {
	return {
		catalog: {
			schemaVersion: value.catalog.schemaVersion,
			revision: value.catalog.revision,
			projects: value.catalog.projects.map(({ id, name, repoPath }) => ({
				id,
				name,
				repoPath: pathBasename(repoPath),
			})),
			workspaces: value.catalog.workspaces.map(
				({ id, projectId, name, branch }) => ({
					id,
					projectId,
					name,
					branch,
				}),
			),
		},
		acp: {
			enabled: value.acp.enabled,
			items: value.acp.items.map(
				({ sessionId, workspaceId, title, status, updatedAt }) => ({
					sessionId,
					workspaceId,
					title,
					status,
					updatedAt,
				}),
			),
		},
	};
}

export type PhoneRouteCachePersistence<TValue> = {
	/** Storage is injectable so cache behavior can be tested without a browser. */
	storage?: Storage | null;
	/** The clock is injectable so TTL behavior can be tested deterministically. */
	now?: () => number;
	ttlMs?: number;
	/**
	 * Persist only the fields a route needs. The in-memory cache keeps the full
	 * value, while the stored representation can be a deliberately smaller
	 * projection.
	 */
	serialize?: (value: TValue) => unknown;
	/** Return undefined for a value that is not a valid persisted projection. */
	deserialize?: (value: unknown) => TValue | undefined;
};

type StoredPhoneRouteCache = {
	version: typeof PHONE_ROUTE_CACHE_STORAGE_VERSION;
	cachedAt: number;
	values: Record<string, unknown>;
};

function getBrowserStorage(): Storage | null {
	if (typeof localStorage === "undefined") return null;
	try {
		// Accessing localStorage itself can throw in privacy-restricted webviews.
		return localStorage;
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getPhoneRouteCacheStorageKey(pairingKey: string): string {
	return `superset.phone.route-cache.v${PHONE_ROUTE_CACHE_STORAGE_VERSION}:${encodeURIComponent(pairingKey)}`;
}

function parseStoredCache(raw: string | null): StoredPhoneRouteCache | null {
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) return null;
		if (parsed.version !== PHONE_ROUTE_CACHE_STORAGE_VERSION) return null;
		if (
			typeof parsed.cachedAt !== "number" ||
			!Number.isFinite(parsed.cachedAt)
		)
			return null;
		if (!isRecord(parsed.values)) return null;
		return {
			version: PHONE_ROUTE_CACHE_STORAGE_VERSION,
			cachedAt: parsed.cachedAt,
			values: parsed.values,
		};
	} catch {
		return null;
	}
}

/**
 * Small in-memory cache for route data that should survive React route
 * unmounts. A cache instance has one active pairing at a time. Activating a
 * different pairing drops the previous values so a newly paired phone can
 * never render the prior Host's catalog or session list.
 */
export function createPhoneRouteCache<TValue>(options?: {
	persistence?: PhoneRouteCachePersistence<TValue>;
}): PhoneRouteCache<TValue> {
	let activePairingKey: string | null = null;
	let values = new Map<string, TValue>();
	const persistence = options?.persistence;
	const storage = persistence
		? (persistence.storage ?? getBrowserStorage())
		: null;
	const now = persistence?.now ?? Date.now;
	const ttlMs = persistence?.ttlMs ?? PHONE_ROUTE_CACHE_TTL_MS;
	const serialize = persistence?.serialize ?? ((value: TValue) => value);
	const deserialize =
		persistence?.deserialize ?? ((value: unknown) => value as TValue);

	const removePersisted = (pairingKey: string) => {
		if (!storage) return;
		try {
			storage.removeItem(getPhoneRouteCacheStorageKey(pairingKey));
		} catch {
			// A blocked storage must never break the foreground route.
		}
	};

	const persist = (pairingKey: string) => {
		if (!storage) return;
		try {
			const persistedValues: Record<string, unknown> = {};
			for (const [scope, value] of values) {
				persistedValues[scope] = serialize(value);
			}
			const envelope: StoredPhoneRouteCache = {
				version: PHONE_ROUTE_CACHE_STORAGE_VERSION,
				cachedAt: now(),
				values: persistedValues,
			};
			storage.setItem(
				getPhoneRouteCacheStorageKey(pairingKey),
				JSON.stringify(envelope),
			);
		} catch {
			// Serialization and quota errors are best effort. The memory cache is
			// still useful for the current route and refresh will repopulate it.
		}
	};

	return {
		activate(pairingKey) {
			if (pairingKey === activePairingKey) return;
			activePairingKey = pairingKey;
			values = new Map();
			if (!pairingKey || !storage) return;

			let raw: string | null = null;
			try {
				raw = storage.getItem(getPhoneRouteCacheStorageKey(pairingKey));
			} catch {
				return;
			}
			const stored = parseStoredCache(raw);
			if (!stored || now() - stored.cachedAt >= ttlMs) {
				if (raw !== null) removePersisted(pairingKey);
				return;
			}
			try {
				for (const [scope, rawValue] of Object.entries(stored.values)) {
					const value = deserialize(rawValue);
					if (value === undefined) {
						removePersisted(pairingKey);
						values = new Map();
						return;
					}
					values.set(scope, value);
				}
			} catch {
				removePersisted(pairingKey);
				values = new Map();
			}
		},
		get(scope) {
			if (activePairingKey === null) return undefined;
			return values.get(scope);
		},
		set(scope, value) {
			if (activePairingKey === null) return;
			values.set(scope, value);
			if (persistence) persist(activePairingKey);
		},
		clear() {
			if (activePairingKey !== null) removePersisted(activePairingKey);
			activePairingKey = null;
			values = new Map();
		},
		activeKey() {
			return activePairingKey;
		},
	};
}
