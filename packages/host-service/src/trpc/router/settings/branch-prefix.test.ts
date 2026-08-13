import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { branchPrefixRouter } from "./branch-prefix";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createCaller() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	const caller = branchPrefixRouter.createCaller({
		db,
		isAuthenticated: true,
	} as unknown as HostServiceContext);
	return { caller, db };
}

describe("branchPrefixRouter", () => {
	it("defaults to none without seeding host settings", async () => {
		const { caller, db } = createCaller();

		expect(await caller.get()).toEqual({ mode: "none", customPrefix: null });
		expect(db.select().from(schema.hostSettings).all()).toEqual([]);
	});

	it("persists and clears the host-wide default", async () => {
		const { caller } = createCaller();

		await caller.set({ mode: "custom", customPrefix: "team" });
		expect(await caller.get()).toEqual({
			mode: "custom",
			customPrefix: "team",
		});

		await caller.set({ mode: "none" });
		expect(await caller.get()).toEqual({ mode: "none", customPrefix: null });
	});
});
