import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { worktreeLocationRouter } from "./worktree-location";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");
const LEGACY_ENV = "SUPERSET_LEGACY_WORKTREE_BASE_DIR";
const originalLegacyEnv = process.env[LEGACY_ENV];

function createCaller() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	const caller = worktreeLocationRouter.createCaller({
		db,
		isAuthenticated: true,
	} as unknown as HostServiceContext);
	return { caller, db };
}

afterEach(() => {
	if (originalLegacyEnv === undefined) delete process.env[LEGACY_ENV];
	else process.env[LEGACY_ENV] = originalLegacyEnv;
});

describe("worktreeLocationRouter", () => {
	it("ignores the retired legacy seed and leaves a fresh settings table empty", async () => {
		process.env[LEGACY_ENV] = "/legacy/worktrees";
		const { caller, db } = createCaller();

		const result = await caller.get();
		expect(result.worktreeBaseDir).toBeNull();
		expect(result.defaultWorktreeBaseDir).toBeTruthy();
		expect(db.select().from(schema.hostSettings).all()).toEqual([]);
	});

	it("persists and resets the host-wide worktree location", async () => {
		const { caller } = createCaller();

		expect((await caller.set({ path: "/tmp/worktrees" })).worktreeBaseDir).toBe(
			"/tmp/worktrees",
		);
		expect((await caller.get()).worktreeBaseDir).toBe("/tmp/worktrees");
		expect((await caller.set({ path: null })).worktreeBaseDir).toBeNull();
	});
});
