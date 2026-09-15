import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import type { MemoryAccessSettings } from "./memory-access-settings";
import {
	createProjectMemory,
	deleteProjectMemory,
	listProjectMemories,
	updateProjectMemory,
} from "./project-memory-store";
import {
	listMemoryProjects,
	searchProjectMemories,
} from "./search-project-memories";

const off: MemoryAccessSettings = { mode: "off", projectIds: [] };
const all: MemoryAccessSettings = { mode: "all", projectIds: [] };
const selected: MemoryAccessSettings = { mode: "selected", projectIds: ["b"] };
function fixture() {
	const db = drizzle(new Database(":memory:"), { schema });
	migrate(db, { migrationsFolder: resolve(import.meta.dir, "../../drizzle") });
	for (const id of ["a", "b", "c", "temporary"]) {
		db.insert(schema.projects)
			.values({
				id,
				repoPath: `/repo/${id}`,
				name: id.toUpperCase(),
				kind: id === "temporary" ? "temporary" : "repository",
			})
			.run();
	}
	db.insert(schema.workspaces)
		.values({
			id: "wa",
			projectId: "a",
			worktreePath: "/repo/a",
			branch: "main",
			type: "main",
		})
		.run();
	const hostDb = db as unknown as HostDb;
	for (const projectId of ["a", "b", "c", "temporary", null]) {
		createProjectMemory(hostDb, {
			projectId,
			title: "Login scheme",
			content: `Login architecture from ${projectId ?? "global"}`,
			category: "architecture",
			source: "manual",
		});
	}
	const disabled = createProjectMemory(hostDb, {
		projectId: "b",
		title: "Disabled",
		content: "Hidden login info",
		category: "other",
		source: "manual",
	});
	updateProjectMemory(hostDb, "b", disabled.memory.id, { enabled: false });
	return hostDb;
}
const searchInput = {
	workspaceId: "wa",
	query: "login",
	limit: 50,
	scope: "accessible" as const,
};
const listInput = { workspaceId: "wa", query: "", limit: 50 };

describe("cross-project memory reads", () => {
	test("default deny preserves current and global search even when sharing is enabled", () => {
		const db = fixture();
		expect(
			searchProjectMemories(db, searchInput, off).memories.map(
				(m) => m.projectId,
			),
		).toEqual(["a", null]);
		expect(
			searchProjectMemories(
				db,
				{ ...searchInput, scope: "all" },
				all,
			).memories.map((m) => m.projectId),
		).toEqual(["a", null]);
		expect(
			listMemoryProjects(db, listInput, off).projects.map((p) => p.id),
		).toEqual(["a"]);
	});

	test("selected projects can be discovered, searched, and attributed, but not written", () => {
		const db = fixture();
		expect(
			listMemoryProjects(db, listInput, selected).projects.map((p) => p.id),
		).toEqual(["a", "b"]);
		const result = searchProjectMemories(db, searchInput, selected);
		expect(result.memories.map((m) => m.projectId)).toEqual(["a", null, "b"]);
		const external = result.memories[2];
		expect(external).toMatchObject({
			projectName: "B",
			projectRepoPath: "/repo/b",
			scope: "external",
			readOnly: true,
		});
		expect(external?.updatedAt).toBeNumber();
		if (!external) throw new Error("Missing external memory");
		expect(
			updateProjectMemory(db, "a", external.id, { content: "overwrite" }),
		).toBeNull();
		expect(
			updateProjectMemory(db, null, external.id, { content: "overwrite" }),
		).toBeNull();
		expect(deleteProjectMemory(db, "a", external.id)).toBe(false);
		expect(deleteProjectMemory(db, null, external.id)).toBe(false);
		expect(listProjectMemories(db, { projectId: "b" })[0]?.content).toBe(
			"Login architecture from b",
		);
		// Injection continues to use this single-project listing.
		expect(
			listProjectMemories(db, { projectId: "a" }).map((m) => m.projectId),
		).toEqual(["a"]);
	});

	test("explicit targets are checked every call, including revocation and nonexistent IDs", () => {
		const db = fixture();
		const input = { ...searchInput, scope: "project" as const, projectId: "b" };
		expect(searchProjectMemories(db, input, selected).memories).toHaveLength(1);
		expect(() => searchProjectMemories(db, input, off)).toThrow(
			"not permitted",
		);
		expect(() =>
			searchProjectMemories(db, { ...input, projectId: "c" }, selected),
		).toThrow("not permitted");
		expect(() =>
			searchProjectMemories(db, { ...input, projectId: "missing" }, all),
		).toThrow("not permitted");
		expect(() =>
			searchProjectMemories(db, { ...input, scope: "global" }, all),
		).toThrow("projectId requires");
		expect(() =>
			searchProjectMemories(
				db,
				{ ...searchInput, workspaceId: "missing" },
				all,
			),
		).toThrow("Workspace not found");
	});

	test("host-wide access excludes temporary projects and disabled rows, with bounded results", () => {
		const db = fixture();
		expect(
			new Set(
				searchProjectMemories(db, searchInput, all).memories.map(
					(m) => m.projectId,
				),
			),
		).toEqual(new Set(["a", null, "b", "c"]));
		expect(
			listMemoryProjects(db, listInput, all).projects.map((p) => p.id),
		).toEqual(["a", "b", "c"]);
		expect(
			listMemoryProjects(
				db,
				{ ...listInput, query: "/repo/b" },
				all,
			).projects.map((p) => p.id),
		).toEqual(["b"]);
		expect(
			listMemoryProjects(db, { ...listInput, limit: 1 }, all),
		).toMatchObject({ hasMore: true, projects: [{ id: "a" }] });
		expect(
			searchProjectMemories(db, { ...searchInput, limit: 1 }, all),
		).toMatchObject({ hasMore: true, memories: [{ projectId: "a" }] });
		expect(
			searchProjectMemories(db, { ...searchInput, query: "%" }, all).memories,
		).toEqual([]);
		expect(
			searchProjectMemories(
				db,
				{ ...searchInput, query: "", scope: "project", projectId: "b" },
				all,
			).memories,
		).toHaveLength(1);
	});
});
