import { decodeAutoMateResumeSession } from "./automate-resume";

const KEY = "superset.phone.session.v1";

export interface StoredSession {
	token: string;
	sessionId: string;
	hostName: string;
	hostId: string;
	expiresAt: number;
	/** Present only for sessions paired through the AutoMate WebApp. */
	relayMailboxId?: string;
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
	const resumed =
		typeof location === "undefined"
			? null
			: decodeAutoMateResumeSession(location.hash);
	if (resumed) return resumed;
	if (typeof localStorage === "undefined") return null;
	const stored = safeParse(localStorage.getItem(KEY));
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
	localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
	localStorage.removeItem(KEY);
}
