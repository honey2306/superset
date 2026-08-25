const PAIRING_ATTEMPT_STORAGE_PREFIX = "superset.phone.pairing-attempt.v1:";
const REDEEM_NONCE_BYTES = 24;

export const PAIRING_ATTEMPT_TIMEOUT_MS = 15_000;
export const PAIRING_ATTEMPT_MAX_ATTEMPTS = 3;

export interface PairingAttempt {
	code: string;
	redeemNonce: string;
}

export interface PairingAttemptStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface PairingAttemptStatus {
	kind: "attempting" | "retrying" | "timeout";
	attempt: number;
	maxAttempts: number;
}

export interface PairingAttemptRetryOptions {
	timeoutMs?: number;
	maxAttempts?: number;
	backoffMs?: readonly number[] | ((attempt: number) => number);
	sleep?: (milliseconds: number) => Promise<void>;
	onStatus?: (status: PairingAttemptStatus) => void;
	shouldRetry?: (error: unknown) => boolean;
	/** Injectable timeout race for tests and non-browser callers. */
	timeout?: <T>(
		operation: Promise<T>,
		timeoutMs: number,
		attempt: number,
	) => Promise<T>;
}

export class PairingAttemptTimeoutError extends Error {
	readonly attempt: number;

	constructor(attempt: number) {
		super("Pairing request timed out.");
		this.name = "PairingAttemptTimeoutError";
		this.attempt = attempt;
	}
}

function normalizeCode(code: string): string {
	return code.trim().toUpperCase();
}

function getDefaultStorage(): PairingAttemptStorage | undefined {
	if (typeof localStorage === "undefined") return undefined;
	try {
		// Accessing localStorage can throw in privacy-restricted webviews.
		localStorage.getItem(PAIRING_ATTEMPT_STORAGE_PREFIX);
		return localStorage;
	} catch {
		return undefined;
	}
}

export function getPairingAttemptStorageKey(code: string): string {
	return `${PAIRING_ATTEMPT_STORAGE_PREFIX}${encodeURIComponent(normalizeCode(code))}`;
}

function encodeBase64Url(bytes: Uint8Array): string {
	const alphabet =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	let output = "";
	for (let index = 0; index < bytes.length; index += 3) {
		const first = bytes[index] ?? 0;
		const second = bytes[index + 1] ?? 0;
		const third = bytes[index + 2] ?? 0;
		const value = (first << 16) | (second << 8) | third;
		output += alphabet[(value >>> 18) & 63];
		output += alphabet[(value >>> 12) & 63];
		output += index + 1 < bytes.length ? alphabet[(value >>> 6) & 63] : "=";
		output += index + 2 < bytes.length ? alphabet[value & 63] : "=";
	}
	return output.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function generateRedeemNonce(
	randomValues: (bytes: Uint8Array) => Uint8Array = (bytes) =>
		globalThis.crypto.getRandomValues(
			bytes as Uint8Array<ArrayBuffer>,
		) as unknown as Uint8Array,
): string {
	return encodeBase64Url(randomValues(new Uint8Array(REDEEM_NONCE_BYTES)));
}

function parseStoredNonce(raw: string | null): string | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as { redeemNonce?: unknown };
		if (
			typeof parsed.redeemNonce === "string" &&
			parsed.redeemNonce.length >= 16 &&
			parsed.redeemNonce.length <= 128 &&
			/^[A-Za-z0-9_-]+$/.test(parsed.redeemNonce)
		) {
			return parsed.redeemNonce;
		}
		return null;
	} catch {
		return null;
	}
}

/** Returns the same nonce for this code until the attempt succeeds and is cleared. */
export function getOrCreatePairingAttempt(
	code: string,
	options: {
		storage?: PairingAttemptStorage;
		nonceFactory?: () => string;
	} = {},
): PairingAttempt {
	const normalizedCode = normalizeCode(code);
	const storage = options.storage ?? getDefaultStorage();
	const key = getPairingAttemptStorageKey(normalizedCode);
	let existingNonce: string | null = null;
	try {
		existingNonce = storage ? parseStoredNonce(storage.getItem(key)) : null;
	} catch {
		// Pairing still works for this page lifetime if storage is unavailable.
	}
	if (existingNonce)
		return { code: normalizedCode, redeemNonce: existingNonce };

	const redeemNonce = (options.nonceFactory ?? generateRedeemNonce)();
	if (storage) {
		try {
			// Deliberately persist only the retry nonce. Bearer/task tokens never
			// belong in this recovery record.
			storage.setItem(key, JSON.stringify({ redeemNonce }));
		} catch {
			// Pairing still works for this page lifetime if storage is unavailable.
		}
	}
	return { code: normalizedCode, redeemNonce };
}

export function clearPairingAttempt(
	code: string,
	storage: PairingAttemptStorage | undefined = getDefaultStorage(),
): void {
	if (!storage) return;
	try {
		storage.removeItem(getPairingAttemptStorageKey(code));
	} catch {
		// Ignore storage failures; the next successful attempt can overwrite it.
	}
}

function defaultSleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function defaultTimeout<T>(
	operation: Promise<T>,
	timeoutMs: number,
	attempt: number,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new PairingAttemptTimeoutError(attempt)),
			timeoutMs,
		);
		operation.then(resolve, reject).finally(() => clearTimeout(timer));
	});
}

function errorText(error: unknown): string {
	if (error instanceof Error) return error.message.toLowerCase();
	if (typeof error === "string") return error.toLowerCase();
	return "";
}

export function isRetryablePairingError(error: unknown): boolean {
	const message = errorText(error);
	if (
		message.includes("invalid or has expired") ||
		message.includes("too many pairing attempts") ||
		message.includes("redeemed")
	) {
		return false;
	}
	if (error instanceof PairingAttemptTimeoutError) return true;
	return (
		message.includes("network") ||
		message.includes("fetch") ||
		message.includes("relay") ||
		message.includes("timeout") ||
		message.includes("timed out") ||
		message.includes("connection") ||
		message.includes("service unavailable") ||
		message.includes("internal server") ||
		message.includes("isolated-vm") ||
		/\b50[0234]\b/.test(message)
	);
}

function getBackoffMs(
	backoffMs: readonly number[] | ((attempt: number) => number),
	attempt: number,
): number {
	const value =
		typeof backoffMs === "function"
			? backoffMs(attempt)
			: (backoffMs[attempt - 1] ?? backoffMs[backoffMs.length - 1] ?? 0);
	return Math.max(0, value);
}

/**
 * Executes a pairing redeem with one stable nonce and bounded transient
 * retries. The timeout and sleep dependencies are injectable so protocol
 * tests do not need to wait for wall-clock timers.
 */
export async function redeemPairingWithRetry<T>(
	pairingAttempt: PairingAttempt,
	redeem: (attempt: PairingAttempt) => Promise<T>,
	options: PairingAttemptRetryOptions = {},
): Promise<T> {
	const timeoutMs = options.timeoutMs ?? PAIRING_ATTEMPT_TIMEOUT_MS;
	const maxAttempts = Math.max(
		1,
		Math.floor(options.maxAttempts ?? PAIRING_ATTEMPT_MAX_ATTEMPTS),
	);
	const backoffMs = options.backoffMs ?? [250, 500];
	const sleep = options.sleep ?? defaultSleep;
	const timeout = options.timeout ?? defaultTimeout;
	const shouldRetry = options.shouldRetry ?? isRetryablePairingError;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		options.onStatus?.({
			kind: attempt === 1 ? "attempting" : "retrying",
			attempt,
			maxAttempts,
		});
		try {
			const operation = Promise.resolve().then(() => redeem(pairingAttempt));
			return await timeout(operation, timeoutMs, attempt);
		} catch (error) {
			if (attempt >= maxAttempts || !shouldRetry(error)) throw error;
			if (error instanceof PairingAttemptTimeoutError) {
				options.onStatus?.({ kind: "timeout", attempt, maxAttempts });
			}
			await sleep(getBackoffMs(backoffMs, attempt));
		}
	}

	throw new Error("Pairing attempt did not execute.");
}
