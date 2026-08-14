import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/db/schema";

/** Test-only host DB adapter for daemon E2E runs under Bun. */
export function createDb(dbPath: string) {
	const sqlite = new Database(dbPath, { create: true, readwrite: true });
	sqlite.exec("PRAGMA journal_mode = WAL");
	sqlite.exec("PRAGMA foreign_keys = ON");
	return drizzle(sqlite, { schema });
}
