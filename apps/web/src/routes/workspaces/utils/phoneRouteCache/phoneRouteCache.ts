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

/**
 * Small in-memory cache for route data that should survive React route
 * unmounts. A cache instance has one active pairing at a time. Activating a
 * different pairing drops the previous values so a newly paired phone can
 * never render the prior Host's catalog or session list.
 */
export function createPhoneRouteCache<TValue>(): PhoneRouteCache<TValue> {
	let activePairingKey: string | null = null;
	let values = new Map<string, TValue>();

	return {
		activate(pairingKey) {
			if (pairingKey === activePairingKey) return;
			activePairingKey = pairingKey;
			values = new Map();
		},
		get(scope) {
			if (activePairingKey === null) return undefined;
			return values.get(scope);
		},
		set(scope, value) {
			if (activePairingKey === null) return;
			values.set(scope, value);
		},
		clear() {
			activePairingKey = null;
			values = new Map();
		},
		activeKey() {
			return activePairingKey;
		},
	};
}
