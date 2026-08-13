import type { StoredSession } from "./auth-store";

export const AUTOMATE_WEBAPP_PATH = "/webapp/16740";
const resumeRoutePrefix = "/r/";
const sessionKeys = [
	"token",
	"sessionId",
	"hostName",
	"hostId",
	"expiresAt",
	"relayMailboxId",
] as const;

function base64UrlEncode(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

function base64UrlDecode(value: string): string | null {
	if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
	try {
		const padded = `${value.replaceAll("-", "+").replaceAll("_", "/")}${"=".repeat((4 - (value.length % 4)) % 4)}`;
		const binary = atob(padded);
		const bytes = Uint8Array.from(binary, (character) =>
			character.charCodeAt(0),
		);
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}

function hasStoredSessionShape(value: unknown): value is StoredSession {
	if (!value || typeof value !== "object") return false;
	const session = value as Record<string, unknown>;
	if (
		Object.keys(session).length !== sessionKeys.length ||
		!sessionKeys.every((key) => key in session)
	) {
		return false;
	}
	return (
		typeof session.token === "string" &&
		session.token.length > 0 &&
		typeof session.sessionId === "string" &&
		session.sessionId.length > 0 &&
		typeof session.hostName === "string" &&
		typeof session.hostId === "string" &&
		typeof session.expiresAt === "number" &&
		Number.isFinite(session.expiresAt) &&
		typeof session.relayMailboxId === "string" &&
		session.relayMailboxId.length > 0
	);
}

function isStoredSession(value: unknown): value is StoredSession {
	return hasStoredSessionShape(value) && value.expiresAt > Date.now();
}

export function encodeAutoMateResumeSession(session: StoredSession): string {
	if (!hasStoredSessionShape(session)) {
		throw new Error("AutoMate resume sessions require a valid relay mailbox");
	}
	return base64UrlEncode(JSON.stringify(session));
}

export function getAutoMateResumeUrl(session: StoredSession): string {
	const route = `${resumeRoutePrefix}${encodeAutoMateResumeSession(session)}`;
	return `${AUTOMATE_WEBAPP_PATH}#${route}`;
}

export function decodeAutoMateResumeSession(
	hash: string,
): StoredSession | null {
	const match = new RegExp(
		`^#${resumeRoutePrefix}([A-Za-z0-9_-]+)(?:/w/[^/?#]+(?:/(?:s|t)/[^/?#]+)?)?$`,
	).exec(hash);
	if (!match) return null;
	const decoded = base64UrlDecode(match[1]);
	if (!decoded) return null;
	try {
		const parsed: unknown = JSON.parse(decoded);
		return isStoredSession(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export function getAutoMateCleanPairPath(pathname: string): string {
	return pathname === "/app" || pathname.startsWith("/app/")
		? "/app/pair"
		: `${AUTOMATE_WEBAPP_PATH}#/pair`;
}

export function getAutoMatePairSuccessPath(
	session: StoredSession,
	isAutoMate: boolean,
): string | null {
	return isAutoMate && session.relayMailboxId
		? getAutoMateResumeUrl(session)
		: null;
}

export function isAutoMateWebAppPath(pathname: string): boolean {
	return (
		pathname === AUTOMATE_WEBAPP_PATH ||
		pathname.startsWith(`${AUTOMATE_WEBAPP_PATH}/`)
	);
}
