import { Database as BunDatabase } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import { PhoneAuthService } from "./PhoneAuthService";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");

interface Fixture {
	db: HostDb;
	service: PhoneAuthService;
	dispose: () => void;
}

function boot(): Fixture {
	const dir = mkdtempSync(join(tmpdir(), "phone-auth-test-"));
	const sqlite = new BunDatabase(join(dir, "host.db"), {
		create: true,
		readwrite: true,
	});
	sqlite.exec("PRAGMA journal_mode = WAL");
	sqlite.exec("PRAGMA foreign_keys = ON");
	const drizzled = drizzle(sqlite, { schema });
	migrate(drizzled, { migrationsFolder: MIGRATIONS_FOLDER });
	const db = drizzled as unknown as HostDb;
	const service = new PhoneAuthService({ db });
	return {
		db,
		service,
		dispose: () => {
			sqlite.close();
			rmSync(dir, { recursive: true, force: true });
		},
	};
}

describe("PhoneAuthService", () => {
	let fx: Fixture;
	beforeEach(() => {
		fx = boot();
	});
	afterEach(() => fx.dispose());

	test("mints a pairing code that redeems to a session", async () => {
		const { code } = fx.service.mintPairingCode();
		expect(code).toMatch(/^[0-9A-HJ-NP-TV-Z]{4}-[0-9A-HJ-NP-TV-Z]{4}$/);
		const result = await fx.service.redeemPairingCode({
			code,
			deviceLabel: "iPhone",
		});
		expect(result.token).toHaveLength(43); // 32 raw bytes → base64url
		expect(result.sessionId).toBeString();
		const row = fx.service.validateRawToken(result.token);
		expect(row?.id).toBe(result.sessionId);
		expect(row?.deviceLabel).toBe("iPhone");
	});

	test("rejects unknown pairing codes", async () => {
		await expect(
			fx.service.redeemPairingCode({ code: "BOGUS-CODE" }),
		).rejects.toThrow(/invalid or has expired/i);
	});

	test("rejects a code that has already been redeemed", async () => {
		const { code } = fx.service.mintPairingCode();
		await fx.service.redeemPairingCode({ code });
		await expect(fx.service.redeemPairingCode({ code })).rejects.toThrow(
			/invalid or has expired/i,
		);
	});

	test("validateRawToken returns null for unknown / revoked tokens", async () => {
		expect(fx.service.validateRawToken("garbage")).toBeNull();
		const { code } = fx.service.mintPairingCode();
		const { token, sessionId } = await fx.service.redeemPairingCode({ code });
		fx.service.revoke(sessionId);
		expect(fx.service.validateRawToken(token)).toBeNull();
	});

	test("revoked sessions do not appear in listSessions", async () => {
		const { code } = fx.service.mintPairingCode();
		const { sessionId } = await fx.service.redeemPairingCode({
			code,
			deviceLabel: "device-a",
		});
		expect(fx.service.listSessions().map((s) => s.id)).toEqual([sessionId]);
		fx.service.revoke(sessionId);
		expect(fx.service.listSessions()).toEqual([]);
	});

	test("enforces rate limit on redeem attempts per IP", async () => {
		const { code } = fx.service.mintPairingCode();
		const attempts: Promise<unknown>[] = [];
		// 10/min per IP: first 10 exhaust the bucket; #11 must be rejected as
		// TOO_MANY_REQUESTS even though the code itself is valid.
		for (let i = 0; i < 10; i++) {
			attempts.push(
				fx.service
					.redeemPairingCode(
						{ code: "NOPE-NOPE" },
						{ remoteAddress: "1.2.3.4" },
					)
					.catch(() => null),
			);
		}
		await Promise.all(attempts);
		await expect(
			fx.service.redeemPairingCode({ code }, { remoteAddress: "1.2.3.4" }),
		).rejects.toThrow(/too many/i);
	});

	test("pruneExpired drops stale rate-limit buckets", async () => {
		// Fill a bucket for one IP; the internal Map must contain it until we
		// prune. Because pruneExpired() only removes entries with resetAt in
		// the past, we reach into the private field to backdate the entry
		// instead of waiting 60s in the test.
		await fx.service
			.redeemPairingCode({ code: "NOPE-NOPE" }, { remoteAddress: "9.9.9.9" })
			.catch(() => null);
		const attempts = (
			fx.service as unknown as {
				redeemAttempts: Map<string, { count: number; resetAt: number }>;
			}
		).redeemAttempts;
		expect(attempts.has("9.9.9.9")).toBe(true);
		const entry = attempts.get("9.9.9.9");
		if (entry) entry.resetAt = Date.now() - 1;
		fx.service.pruneExpired();
		expect(attempts.has("9.9.9.9")).toBe(false);
	});
});
