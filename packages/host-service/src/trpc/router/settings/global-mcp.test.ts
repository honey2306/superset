import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { globalMcpRouter } from "./global-mcp";

const directories: string[] = [];
const originalHome = process.env.SUPERSET_HOME_DIR;

function createCaller() {
	const directory = mkdtempSync(path.join(tmpdir(), "global-mcp-router-"));
	directories.push(directory);
	process.env.SUPERSET_HOME_DIR = directory;
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	return globalMcpRouter.createCaller({
		db,
		isAuthenticated: true,
	} as unknown as HostServiceContext);
}

afterEach(() => {
	if (originalHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = originalHome;
	for (const directory of directories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("globalMcpRouter", () => {
	it("supports atomic rename and delete", async () => {
		const caller = createCaller();
		await caller.upsert({
			server: {
				name: "docs",
				command: "npx",
				args: ["docs-mcp"],
				env: {},
				enabled: true,
			},
		});
		await caller.upsert({
			originalName: "docs",
			server: {
				name: "documentation",
				command: "bunx",
				args: ["docs-mcp"],
				env: {},
				enabled: true,
			},
		});
		expect((await caller.list()).servers.map((server) => server.name)).toEqual([
			"documentation",
		]);
		expect((await caller.remove({ name: "documentation" })).removed).toBe(true);
		expect((await caller.list()).servers).toEqual([]);
	});

	it("rejects malformed and reserved server definitions", async () => {
		const caller = createCaller();
		await expect(
			caller.upsert({
				server: {
					name: "superset",
					command: "node",
					args: [],
					env: {},
					enabled: true,
				},
			}),
		).rejects.toThrow("reserved");
		await expect(
			caller.upsert({
				server: {
					name: "valid",
					command: "node",
					args: [],
					env: { "BAD-NAME": "value" },
					enabled: true,
				},
			}),
		).rejects.toThrow();
	});
});
