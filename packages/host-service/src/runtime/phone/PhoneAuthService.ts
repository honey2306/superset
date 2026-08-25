import { createHash, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, lt } from "drizzle-orm";
import type { HostDb } from "../../db";
import { phonePairingCodes, phoneSessions } from "../../db/schema";

const PAIRING_CODE_TTL_MS = 60_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const INVALID_REDEEM_DELAY_MS = 50;
const REDEEM_RATE_LIMIT_PER_MIN = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const REDEEM_NONCE_MIN_LENGTH = 16;
const REDEEM_NONCE_MAX_LENGTH = 128;
const TOKEN_DOMAIN = "superset.phone-pairing.token.v1";
const SESSION_DOMAIN = "superset.phone-pairing.session.v1";

function encodeCrockford(bytes: Buffer): string {
	let out = "";
	let bits = 0;
	let value = 0;
	for (const b of bytes) {
		value = (value << 8) | b;
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			out += CROCKFORD[(value >>> bits) & 31];
		}
	}
	if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
	return out;
}

function generatePairingCode(): string {
	// 40 bits of entropy → 8 base32 chars. Chunked as XXXX-XXXX for readability.
	const raw = encodeCrockford(randomBytes(5)).slice(0, 8);
	return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

function generateRawToken(): string {
	return randomBytes(32).toString("base64url");
}

function hashToken(raw: string): string {
	return createHash("sha256").update(raw).digest("hex");
}

/**
 * The phone persists this value before starting a redeem request. Keep it
 * URL-safe so it can safely cross the relay and require enough entropy that a
 * leaked pairing code cannot be extended into a guessable session bearer.
 */
export function isValidRedeemNonce(value: string): boolean {
	return (
		value.length >= REDEEM_NONCE_MIN_LENGTH &&
		value.length <= REDEEM_NONCE_MAX_LENGTH &&
		/^[A-Za-z0-9_-]+$/.test(value)
	);
}

function normalizePairingCode(code: string): string {
	return code.trim().toUpperCase();
}

function deriveDigest(domain: string, code: string, nonce: string): Buffer {
	return createHash("sha256")
		.update(domain)
		.update("\0")
		.update(code)
		.update("\0")
		.update(nonce)
		.digest();
}

function formatUuid(bytes: Buffer): string {
	// Keep the deterministic value in the familiar RFC 4122 UUID shape while
	// marking it as a v4/variant UUID. It is a derived identifier, not a claim
	// that the UUID was generated randomly.
	const uuidBytes = Buffer.from(bytes);
	uuidBytes[6] = ((uuidBytes[6] ?? 0) & 0x0f) | 0x40;
	uuidBytes[8] = ((uuidBytes[8] ?? 0) & 0x3f) | 0x80;
	const hex = uuidBytes.toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
		12,
		16,
	)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function deriveRedeemCredentials(
	code: string,
	nonce: string,
): { rawToken: string; sessionId: string } {
	const tokenDigest = deriveDigest(TOKEN_DOMAIN, code, nonce);
	const sessionDigest = deriveDigest(SESSION_DOMAIN, code, nonce);
	return {
		rawToken: tokenDigest.toString("base64url"),
		sessionId: formatUuid(sessionDigest),
	};
}

function isUniqueConstraintError(error: unknown): boolean {
	return (
		error instanceof Error &&
		/(?:unique|primary key|constraint)/i.test(error.message)
	);
}

export interface PhoneSessionRow {
	id: string;
	deviceLabel: string;
	createdAt: number;
	expiresAt: number;
	lastSeenAt: number;
}

export interface MintPairingResult {
	code: string;
	expiresAt: number;
}

export interface RedeemPairingInput {
	code: string;
	deviceLabel?: string;
	/** Stable, phone-generated retry key. Legacy callers may omit it. */
	redeemNonce?: string;
}

export interface RedeemPairingResult {
	token: string;
	sessionId: string;
	expiresAt: number;
}

export interface PhoneSessionSummary {
	id: string;
	deviceLabel: string;
	createdAt: number;
	expiresAt: number;
	lastSeenAt: number;
}

export class PhoneAuthService {
	private readonly db: HostDb;
	private readonly redeemAttempts = new Map<
		string,
		{ count: number; resetAt: number }
	>();
	private lastSeenFlushAt = 0;

	constructor(options: { db: HostDb }) {
		this.db = options.db;
	}

	mintPairingCode(): MintPairingResult {
		this.pruneExpiredCodes();
		const now = Date.now();
		const expiresAt = now + PAIRING_CODE_TTL_MS;
		// Collisions are astronomically unlikely (40-bit code, 60s TTL), but
		// retry on the off chance to avoid a UNIQUE PRIMARY KEY error rejecting
		// a user-facing mint call.
		for (let attempt = 0; attempt < 5; attempt++) {
			const code = generatePairingCode();
			try {
				this.db
					.insert(phonePairingCodes)
					.values({ code, createdAt: now, expiresAt })
					.run();
				return { code, expiresAt };
			} catch (err) {
				if (attempt === 4) throw err;
			}
		}
		throw new Error("failed to mint pairing code");
	}

	async redeemPairingCode(
		input: RedeemPairingInput,
		context: { remoteAddress?: string } = {},
	): Promise<RedeemPairingResult> {
		this.enforceRedeemRateLimit(context.remoteAddress ?? "unknown");
		const now = Date.now();
		const code = normalizePairingCode(input.code);
		const redeemNonce = input.redeemNonce;
		if (redeemNonce !== undefined && !isValidRedeemNonce(redeemNonce)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `redeemNonce must be ${REDEEM_NONCE_MIN_LENGTH}-${REDEEM_NONCE_MAX_LENGTH} URL-safe characters.`,
			});
		}
		const derived = redeemNonce
			? deriveRedeemCredentials(code, redeemNonce)
			: null;
		const row = this.db
			.select()
			.from(phonePairingCodes)
			.where(eq(phonePairingCodes.code, code))
			.get();
		if (!row) {
			// Constant-time-ish response — real DB row misses take a few ms and
			// expired rows return near-instantly. Pad both to blunt code guessing.
			await delay(INVALID_REDEEM_DELAY_MS);
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Pairing code is invalid or has expired.",
			});
		}
		if (row.redeemedAt !== null) {
			const idempotent = derived
				? this.getIdempotentRedeemResult(row.redeemedSessionId, derived, now)
				: null;
			if (idempotent) return idempotent;
			await delay(INVALID_REDEEM_DELAY_MS);
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Pairing code is invalid or has expired.",
			});
		}
		if (row.expiresAt <= now) {
			// An already-redeemed code is handled above so a lost response can be
			// recovered after the short code TTL. Only an unredeemed expired code
			// is rejected for its pairing-code expiry.
			await delay(INVALID_REDEEM_DELAY_MS);
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Pairing code is invalid or has expired.",
			});
		}
		const rawToken = derived?.rawToken ?? generateRawToken();
		const sessionId = derived?.sessionId ?? randomUUID();
		const expiresAt = now + SESSION_TTL_MS;
		const deviceLabel = (input.deviceLabel ?? "").slice(0, 64);
		let insertedSession = false;
		// Two-step write instead of one transaction: better-sqlite3 does not
		// have a first-class transaction wrapper via drizzle here, and the
		// primary-key UPDATE-with-guard below serializes the redeem to at most
		// once regardless of concurrent callers.
		try {
			this.db
				.insert(phoneSessions)
				.values({
					id: sessionId,
					tokenHash: hashToken(rawToken),
					deviceLabel,
					createdAt: now,
					expiresAt,
					lastSeenAt: now,
				})
				.run();
			insertedSession = true;
		} catch (error) {
			// A deterministic retry races with the original request by design. A
			// duplicate primary key is therefore an expected signal; the guarded
			// code update below decides whether this caller won or can return the
			// already-created session. Other database failures must propagate.
			if (!derived || !isUniqueConstraintError(error)) throw error;
		}
		const updated = this.db
			.update(phonePairingCodes)
			.set({ redeemedAt: now, redeemedSessionId: sessionId })
			.where(
				and(
					eq(phonePairingCodes.code, code),
					isNull(phonePairingCodes.redeemedAt),
				),
			)
			.run();
		if (updated.changes === 0) {
			// A concurrent redeem beat us to the code. A deterministic retry may
			// be the same caller (or a response-lost caller), so first inspect the
			// winner and return it when its derived identity matches. Never delete
			// that shared session, even when it has since been revoked.
			const current = this.db
				.select()
				.from(phonePairingCodes)
				.where(eq(phonePairingCodes.code, code))
				.get();
			const idempotent = derived
				? this.getIdempotentRedeemResult(
						current?.redeemedSessionId,
						derived,
						now,
					)
				: null;
			if (idempotent) return idempotent;
			// Only remove a session this invocation actually inserted, and only
			// when the code points at a different winner. A duplicate insert from
			// the same nonce has insertedSession=false and is never cleaned here.
			if (
				insertedSession &&
				(!current || current.redeemedSessionId !== sessionId)
			) {
				this.db
					.delete(phoneSessions)
					.where(eq(phoneSessions.id, sessionId))
					.run();
			}
			await delay(INVALID_REDEEM_DELAY_MS);
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Pairing code is invalid or has expired.",
			});
		}
		if (derived) {
			// The session may have been inserted by a same-nonce request that won
			// the primary-key race. Read its persisted expiry rather than deriving
			// a new one from this request's clock.
			const idempotent = this.getIdempotentRedeemResult(
				sessionId,
				derived,
				now,
			);
			if (idempotent) return idempotent;
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Unable to create the phone session.",
			});
		}
		return { token: rawToken, sessionId, expiresAt };
	}

	private getIdempotentRedeemResult(
		redeemedSessionId: string | null | undefined,
		derived: { rawToken: string; sessionId: string },
		now: number,
	): RedeemPairingResult | null {
		if (redeemedSessionId !== derived.sessionId) return null;
		const session = this.db
			.select()
			.from(phoneSessions)
			.where(eq(phoneSessions.id, derived.sessionId))
			.get();
		if (
			!session ||
			session.tokenHash !== hashToken(derived.rawToken) ||
			session.revokedAt !== null ||
			session.expiresAt <= now
		) {
			return null;
		}
		this.touchLastSeen(session.id, now);
		return {
			token: derived.rawToken,
			sessionId: session.id,
			expiresAt: session.expiresAt,
		};
	}

	validateRawToken(rawToken: string): PhoneSessionRow | null {
		if (!rawToken) return null;
		const now = Date.now();
		const row = this.db
			.select()
			.from(phoneSessions)
			.where(eq(phoneSessions.tokenHash, hashToken(rawToken)))
			.get();
		if (!row) return null;
		if (row.revokedAt !== null || row.expiresAt <= now) return null;
		this.touchLastSeen(row.id, now);
		return {
			id: row.id,
			deviceLabel: row.deviceLabel,
			createdAt: row.createdAt,
			expiresAt: row.expiresAt,
			lastSeenAt: row.lastSeenAt,
		};
	}

	listSessions(): PhoneSessionSummary[] {
		const now = Date.now();
		return this.db
			.select()
			.from(phoneSessions)
			.all()
			.filter((r) => r.revokedAt === null && r.expiresAt > now)
			.map((r) => ({
				id: r.id,
				deviceLabel: r.deviceLabel,
				createdAt: r.createdAt,
				expiresAt: r.expiresAt,
				lastSeenAt: r.lastSeenAt,
			}));
	}

	revoke(sessionId: string): void {
		this.db
			.update(phoneSessions)
			.set({ revokedAt: Date.now() })
			.where(eq(phoneSessions.id, sessionId))
			.run();
	}

	pruneExpired(): void {
		this.pruneExpiredCodes();
		this.pruneRedeemAttempts();
		const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
		this.db
			.delete(phoneSessions)
			.where(lt(phoneSessions.expiresAt, cutoff))
			.run();
	}

	private pruneRedeemAttempts(): void {
		// Rate-limit buckets are keyed by remote address, so an attacker who
		// walks the IP space (or a NAT churn scenario) can grow the Map
		// unboundedly. Drop expired entries whenever pruneExpired() is
		// invoked so the working set stays bounded to callers within the
		// active 60s window.
		const now = Date.now();
		for (const [key, entry] of this.redeemAttempts) {
			if (entry.resetAt <= now) this.redeemAttempts.delete(key);
		}
	}

	private pruneExpiredCodes(): void {
		this.db
			.delete(phonePairingCodes)
			.where(lt(phonePairingCodes.expiresAt, Date.now() - PAIRING_CODE_TTL_MS))
			.run();
	}

	private enforceRedeemRateLimit(key: string): void {
		const now = Date.now();
		const entry = this.redeemAttempts.get(key);
		if (!entry || entry.resetAt <= now) {
			this.redeemAttempts.set(key, {
				count: 1,
				resetAt: now + RATE_LIMIT_WINDOW_MS,
			});
			return;
		}
		if (entry.count >= REDEEM_RATE_LIMIT_PER_MIN) {
			throw new TRPCError({
				code: "TOO_MANY_REQUESTS",
				message: "Too many pairing attempts. Try again in a minute.",
			});
		}
		entry.count += 1;
	}

	private touchLastSeen(sessionId: string, now: number): void {
		// Throttle writes so hot per-request paths don't hammer sqlite. One
		// UPDATE per second is plenty for a "last seen" indicator.
		if (now - this.lastSeenFlushAt < 1_000) return;
		this.lastSeenFlushAt = now;
		this.db
			.update(phoneSessions)
			.set({ lastSeenAt: now })
			.where(eq(phoneSessions.id, sessionId))
			.run();
	}
}
