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
		const row = this.db
			.select()
			.from(phonePairingCodes)
			.where(eq(phonePairingCodes.code, input.code))
			.get();
		if (!row || row.redeemedAt !== null || row.expiresAt <= now) {
			// Constant-time-ish response — real DB row misses take a few ms and
			// expired rows return near-instantly. Pad both to blunt code guessing.
			await delay(INVALID_REDEEM_DELAY_MS);
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Pairing code is invalid or has expired.",
			});
		}
		const rawToken = generateRawToken();
		const sessionId = randomUUID();
		const expiresAt = now + SESSION_TTL_MS;
		const deviceLabel = (input.deviceLabel ?? "").slice(0, 64);
		// Two-step write instead of one transaction: better-sqlite3 does not
		// have a first-class transaction wrapper via drizzle here, and the
		// primary-key UPDATE-with-guard below serializes the redeem to at most
		// once regardless of concurrent callers.
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
		const updated = this.db
			.update(phonePairingCodes)
			.set({ redeemedAt: now, redeemedSessionId: sessionId })
			.where(
				and(
					eq(phonePairingCodes.code, input.code),
					isNull(phonePairingCodes.redeemedAt),
				),
			)
			.run();
		if (updated.changes === 0) {
			// A concurrent redeem beat us to the code. Roll back the session so
			// the loser never leaves an orphaned bearer.
			this.db
				.delete(phoneSessions)
				.where(eq(phoneSessions.id, sessionId))
				.run();
			await delay(INVALID_REDEEM_DELAY_MS);
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Pairing code is invalid or has expired.",
			});
		}
		return { token: rawToken, sessionId, expiresAt };
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
