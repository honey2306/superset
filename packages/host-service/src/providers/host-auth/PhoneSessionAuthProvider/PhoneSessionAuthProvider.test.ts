import { Database as BunDatabase } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { PhoneAuthService } from "../../../runtime/phone";
import { PhoneSessionAuthProvider } from "./PhoneSessionAuthProvider";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

interface Fixture {
	provider: PhoneSessionAuthProvider;
	service: PhoneAuthService;
	dispose: () => void;
}

function boot(): Fixture {
	const dir = mkdtempSync(join(tmpdir(), "phone-provider-test-"));
	const sqlite = new BunDatabase(join(dir, "host.db"), {
		create: true,
		readwrite: true,
	});
	sqlite.exec("PRAGMA journal_mode = WAL");
	sqlite.exec("PRAGMA foreign_keys = ON");
	const drizzled = drizzle(sqlite, { schema });
	migrate(drizzled, { migrationsFolder: MIGRATIONS_FOLDER });
	const service = new PhoneAuthService({ db: drizzled as unknown as HostDb });
	return {
		service,
		provider: new PhoneSessionAuthProvider(service),
		dispose: () => {
			sqlite.close();
			rmSync(dir, { recursive: true, force: true });
		},
	};
}

describe("PhoneSessionAuthProvider", () => {
	let fx: Fixture;
	beforeEach(() => {
		fx = boot();
	});
	afterEach(() => fx.dispose());

	test("accepts a valid bearer token in the Authorization header", async () => {
		const { code } = fx.service.mintPairingCode();
		const { token } = await fx.service.redeemPairingCode({ code });
		const req = new Request("http://localhost/", {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(await fx.provider.validate(req)).toEqual({
			ok: true,
			kind: "phone",
		});
	});

	test("accepts a valid token via query-string transport", async () => {
		const { code } = fx.service.mintPairingCode();
		const { token } = await fx.service.redeemPairingCode({ code });
		expect(await fx.provider.validateToken(token)).toEqual({
			ok: true,
			kind: "phone",
		});
	});

	test("rejects missing / bogus tokens", async () => {
		expect(
			await fx.provider.validate(new Request("http://localhost/")),
		).toEqual({
			ok: false,
			kind: null,
		});
		expect(await fx.provider.validateToken("bogus")).toEqual({
			ok: false,
			kind: null,
		});
	});

	test("rejects revoked tokens", async () => {
		const { code } = fx.service.mintPairingCode();
		const { token, sessionId } = await fx.service.redeemPairingCode({ code });
		fx.service.revoke(sessionId);
		expect(await fx.provider.validateToken(token)).toEqual({
			ok: false,
			kind: null,
		});
	});
});
