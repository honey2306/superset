import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { projectMemories, projects, workspaces } from "../db/schema";
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

	test("stores global memory separately from project memory", () => {
		const db = createTestDb();
		db.insert(projects)
			.values({ id: "project-1", repoPath: "/repo", name: "Repo" })
			.run();

		const global = createProjectMemory(db, {
			projectId: null,
			title: "Preferred language",
			content: "Always reply in Chinese.",
			category: "preference",
			source: "agent",
		});
		const duplicate = createProjectMemory(db, {
			projectId: null,
			title: "Preferred language",
			content: "Always reply in Chinese.",
			category: "preference",
			source: "agent",
		});
		const project = createProjectMemory(db, {
			projectId: "project-1",
			title: "Preferred language",
			content: "Always reply in Chinese.",
			category: "preference",
			source: "manual",
		});

		expect(global.created).toBe(true);
		expect(duplicate.created).toBe(false);
		expect(project.created).toBe(true);
		expect(
			listProjectMemories(db, { projectId: null, query: "Chinese" }),
		).toHaveLength(1);
		expect(listProjectMemories(db, { projectId: "project-1" })).toHaveLength(1);

		const disabled = updateProjectMemory(db, null, global.memory.id, {
			enabled: false,
		});
		expect(disabled?.enabled).toBe(false);
		expect(listProjectMemories(db, { projectId: null })).toEqual([]);
		expect(
			listProjectMemories(db, { projectId: null, includeDisabled: true }),
		).toHaveLength(1);
		expect(deleteProjectMemory(db, null, global.memory.id)).toBe(true);
	});

	test("keeps global memory when a project is deleted", () => {
		const db = createTestDb();
		db.insert(projects)
			.values({ id: "project-1", repoPath: "/repo", name: "Repo" })
			.run();
		createProjectMemory(db, {
			projectId: null,
			title: "Global workflow",
			content: "Shared across repositories.",
			category: "workflow",
			source: "manual",
		});
		createProjectMemory(db, {
			projectId: "project-1",
			title: "Project workflow",
			content: "Only for this repository.",
			category: "workflow",
			source: "manual",
		});

		db.delete(projectMemories)
			.where(eq(projectMemories.projectId, "project-1"))
			.run();
		db.delete(projects).run();

		expect(listProjectMemories(db, { projectId: null })).toHaveLength(1);
		expect(db.select().from(projectMemories).all()).toHaveLength(1);
	});
});
