import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { memoryAccessRouter } from "./memory-access";

const MIGRATIONS_FOLDER = path.resolve(import.meta.dir, "../../../../drizzle");
const directories: string[] = [];
const originalHome = process.env.SUPERSET_HOME_DIR;

function createCaller() {
	const directory = mkdtempSync(path.join(tmpdir(), "memory-access-router-"));
	directories.push(directory);
	process.env.SUPERSET_HOME_DIR = directory;
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	const caller = memoryAccessRouter.createCaller({
		db,
		isAuthenticated: true,
		organizationId: "test-org",
	} as unknown as HostServiceContext);
	return { caller, db };
}

afterEach(() => {
	if (originalHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = originalHome;
	for (const directory of directories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("memoryAccessRouter", () => {
	it("lists repository projects and persists the selected scope", async () => {
		const { caller, db } = createCaller();
		db.insert(schema.projects)
			.values([
				{
					id: "2a1b9f50-80e9-4633-aefd-bc7065e60980",
					name: "Memory project",
					repoPath: "/code/memory-project",
				},
				{
					id: "29a58fc8-077a-4432-984e-bbf1a0b5b01a",
					name: "",
					repoPath: "/code/temporary",
					kind: "temporary",
				},
			])
			.run();

		expect(await caller.get()).toEqual({
			mode: "off",
			projectIds: [],
			projects: [
				{
					id: "2a1b9f50-80e9-4633-aefd-bc7065e60980",
					name: "Memory project",
					repoPath: "/code/memory-project",
				},
			],
		});
		expect(
			await caller.set({
				mode: "selected",
				projectIds: ["2a1b9f50-80e9-4633-aefd-bc7065e60980"],
			}),
		).toEqual({
			mode: "selected",
			projectIds: ["2a1b9f50-80e9-4633-aefd-bc7065e60980"],
		});
	});

	it("rejects projects that are unavailable on this host", async () => {
		const { caller } = createCaller();
		await expect(
			caller.set({
				mode: "selected",
				projectIds: ["2a1b9f50-80e9-4633-aefd-bc7065e60980"],
			}),
		).rejects.toThrow("unavailable on this host");
	});
});
