import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { projects, workspaces } from "../db/schema";
import {
	createProjectMemory,
	deleteProjectMemory,
	listProjectMemories,
	resolveProjectIdForWorkspace,
	updateProjectMemory,
} from "./project-memory-store";

function createTestDb(): HostDb {
	const db = drizzle(new Database(":memory:"), { schema });
	migrate(db, { migrationsFolder: resolve(import.meta.dir, "../../drizzle") });
	return db as unknown as HostDb;
}

describe("project memory store", () => {
	test("shares enabled memory through the project behind a workspace", () => {
		const db = createTestDb();
		db.insert(projects)
			.values({ id: "project-1", repoPath: "/repo", name: "Repo" })
			.run();
		db.insert(workspaces)
			.values({
				id: "workspace-1",
				projectId: "project-1",
				worktreePath: "/repo",
				branch: "main",
				type: "main",
			})
			.run();

		expect(resolveProjectIdForWorkspace(db, "workspace-1")).toBe("project-1");
		const created = createProjectMemory(db, {
			projectId: "project-1",
			title: "CDP diagnosis",
			content: "Match the renderer port to the current worktree.",
			category: "debugging",
			source: "agent",
			sourceSessionId: "session-1",
			pinned: true,
		});
		expect(created.created).toBe(true);
		expect(
			createProjectMemory(db, {
				projectId: "project-1",
				title: "CDP diagnosis",
				content: "Match the renderer port to the current worktree.",
				category: "debugging",
				source: "agent",
			}).created,
		).toBe(false);
		expect(
			listProjectMemories(db, {
				projectId: "project-1",
				query: "renderer",
				includeDisabled: false,
			}),
		).toHaveLength(1);

		const disabled = updateProjectMemory(db, "project-1", created.memory.id, {
			enabled: false,
		});
		expect(disabled?.enabled).toBe(false);
		expect(
			listProjectMemories(db, {
				projectId: "project-1",
				includeDisabled: false,
			}),
		).toEqual([]);
		expect(deleteProjectMemory(db, "project-1", created.memory.id)).toBe(true);
	});
});
