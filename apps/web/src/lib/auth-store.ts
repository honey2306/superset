import { decodeAutoMateResumeSession } from "./automate-resume";

const LEGACY_KEY = "superset.phone.session.v1";
const SESSION_KEY_PREFIX = "superset.phone.session.v2:";
const ACTIVE_SESSION_KEY = "superset.phone.session.active.v2";
const DIRECT_SESSION_MARKER = "direct";
const NO_ACTIVE_SESSION_MARKER = "none";

export interface StoredSession {
	token: string;
	sessionId: string;
	hostName: string;
	hostId: string;
	expiresAt: number;
	/** Present only for sessions paired through the AutoMate WebApp. */
	relayMailboxId?: string;
}

function getResumeSessionFromLocation(): StoredSession | null {
	if (typeof location === "undefined") return null;
	return decodeAutoMateResumeSession(location.hash, { allowExpired: true });
}

function safeParse(raw: string | null): StoredSession | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<StoredSession>;
		if (
			typeof parsed.token === "string" &&
			typeof parsed.sessionId === "string" &&
			typeof parsed.hostName === "string" &&
			typeof parsed.hostId === "string" &&
			typeof parsed.expiresAt === "number"
		) {
			return parsed as StoredSession;
		}
		return null;
	} catch {
		return null;
	}
}

export function getStoredSession(): StoredSession | null {
	const resumed = getResumeSessionFromLocation();
	if (resumed) {
		if (resumed.expiresAt <= Date.now()) {
			clearStoredSession();
			return null;
		}
		// A direct resume is an explicit environment selection. Re-activate its
		// pointer so a later route transition does not fall back to another slot.
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(
				ACTIVE_SESSION_KEY,
				resumed.relayMailboxId ?? DIRECT_SESSION_MARKER,
			);
		}
		return resumed;
	}
	if (typeof localStorage === "undefined") return null;
	// Relay mailbox ids now carry an opaque environment namespace. Keep one
	// active pointer for the existing app flow while retaining each mailbox's
	// session independently, so pairing dev does not overwrite production.
	const activeSession = localStorage.getItem(ACTIVE_SESSION_KEY);
	if (activeSession === NO_ACTIVE_SESSION_MARKER) return null;
	const stored = safeParse(
		activeSession === null
			? localStorage.getItem(LEGACY_KEY)
			: activeSession === DIRECT_SESSION_MARKER
				? localStorage.getItem(LEGACY_KEY)
				: localStorage.getItem(`${SESSION_KEY_PREFIX}${activeSession}`),
	);
	if (!stored) return null;
	// Treat expired sessions as absent so the app forces a re-pair. The
	// host will 401 anyway, but exiting to `/pair` up front skips a
	// spinner-then-error dance.
	if (stored.expiresAt <= Date.now()) {
		clearStoredSession();
		return null;
	}
	return stored;
}

export function getStoredToken(): string {
	return getStoredSession()?.token ?? "";
}

export function getStoredRelayMailboxId(): string {
	return getStoredSession()?.relayMailboxId ?? "";
}

export function setStoredSession(session: StoredSession): void {
	const mailboxId = session.relayMailboxId;
	localStorage.setItem(
		mailboxId ? `${SESSION_KEY_PREFIX}${mailboxId}` : LEGACY_KEY,
		JSON.stringify(session),
	);
	localStorage.setItem(ACTIVE_SESSION_KEY, mailboxId ?? DIRECT_SESSION_MARKER);
}

export function clearStoredSession(): void {
	if (typeof localStorage === "undefined") return;
	const resumed = getResumeSessionFromLocation();
	const activeSession = localStorage.getItem(ACTIVE_SESSION_KEY);
	const mailboxId =
		resumed?.relayMailboxId ??
		(activeSession &&
		activeSession !== DIRECT_SESSION_MARKER &&
		activeSession !== NO_ACTIVE_SESSION_MARKER
			? activeSession
			: undefined);

	if (mailboxId) {
		localStorage.removeItem(`${SESSION_KEY_PREFIX}${mailboxId}`);
	} else if (activeSession !== NO_ACTIVE_SESSION_MARKER) {
		localStorage.removeItem(LEGACY_KEY);
	}

	// Do not fall back to a different environment on the generic pair route
	// after clearing the current one. An explicit resume/pair link can select a
	// preserved slot and set a new active pointer.
	localStorage.setItem(ACTIVE_SESSION_KEY, NO_ACTIVE_SESSION_MARKER);
}
