/**
 * M0 characterization baseline — read-only identity collision audit.
 *
 * These tests pin the exact behavior of
 * `generateIdentityCollisionReport` so that when M1 grows a real
 * `WorkspaceCatalog` on top of the same canonical identity rule, its
 * report semantics are frozen. The helper is read-only: it must never
 * mutate rows, never rewrite paths, and never touch the filesystem.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { projects, workspaces } from "../../src/db/schema";
import {
	canonicalizePath,
	generateIdentityCollisionReport,
} from "../../src/workspace-catalog/collision-report";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { seedProject, seedWorkspace } from "../helpers/seed";

describe("workspace-catalog identity collision report", () => {
	let host: TestHost | undefined;

	afterEach(async () => {
		if (host) {
			await host.dispose();
			host = undefined;
		}
	});

	test("returns empty buckets on a fresh db", async () => {
		host = await createTestHost();
		const report = generateIdentityCollisionReport(host.db);
		expect(report.duplicateRepoPaths).toEqual([]);
		expect(report.duplicateWorktreePaths).toEqual([]);
	});

	test("groups projects whose repoPath collapses to the same canonical form", async () => {
		host = await createTestHost();
		// Two paths that only differ in a trailing separator collapse to
		// the same canonical form. Real collisions come from the desktop
		// legacy migration writing sometimes-trailing-slash paths.
		const a = seedProject(host, { repoPath: "/tmp/repo-a/" });
		const b = seedProject(host, { repoPath: "/tmp/repo-a" });
		// Untouched project stays out of the report.
		seedProject(host, { repoPath: "/tmp/repo-untouched" });

		const report = generateIdentityCollisionReport(host.db);
		expect(report.duplicateWorktreePaths).toEqual([]);
		expect(report.duplicateRepoPaths).toHaveLength(1);
		const entry = report.duplicateRepoPaths[0];
		expect(entry?.canonicalRepoPath).toBe("/tmp/repo-a");
		expect(entry?.projectIds).toHaveLength(2);
		expect(entry?.projectIds).toEqual([a.id, b.id].sort());
	});

	test("groups workspaces whose worktreePath collapses to the same canonical form", async () => {
		host = await createTestHost();
		const { id: projectId } = seedProject(host, { repoPath: "/tmp/proj" });
		const a = seedWorkspace(host, {
			projectId,
			worktreePath: "/tmp/proj/.worktrees/feature-a\\",
			branch: "feature/a-1",
		});
		const b = seedWorkspace(host, {
			projectId,
			worktreePath: "/tmp/proj/.worktrees/feature-a",
			branch: "feature/a-2",
		});
		// A third, distinct workspace path — must not appear in the report.
		seedWorkspace(host, {
			projectId,
			worktreePath: "/tmp/proj/.worktrees/feature-b",
			branch: "feature/b",
		});

		const report = generateIdentityCollisionReport(host.db);
		expect(report.duplicateRepoPaths).toEqual([]);
		expect(report.duplicateWorktreePaths).toHaveLength(1);
		const entry = report.duplicateWorktreePaths[0];
		expect(entry?.canonicalWorktreePath).toBe("/tmp/proj/.worktrees/feature-a");
		expect(entry?.workspaceIds).toEqual([a.id, b.id].sort());
	});

	test("case-differing paths are NOT considered duplicates (case-sensitive canonicalization)", async () => {
		host = await createTestHost();
		seedProject(host, { repoPath: "/tmp/Repo" });
		seedProject(host, { repoPath: "/tmp/repo" });

		const report = generateIdentityCollisionReport(host.db);
		expect(report.duplicateRepoPaths).toEqual([]);
	});

	test("a lone `/` root path is preserved by canonicalization", () => {
		expect(canonicalizePath("/")).toBe("/");
		expect(canonicalizePath("  /tmp/a/  ")).toBe("/tmp/a");
		expect(canonicalizePath("/tmp/a")).toBe("/tmp/a");
	});

	test("report call is read-only: row counts unchanged after invocation", async () => {
		host = await createTestHost();
		const { id: projectId } = seedProject(host, { repoPath: "/tmp/ro" });
		seedWorkspace(host, {
			projectId,
			worktreePath: "/tmp/ro",
			branch: "main",
		});
		// A pair of collisions to make sure the read path actually walks
		// the tables (an empty helper would trivially "not mutate").
		seedProject(host, { id: randomUUID(), repoPath: "/tmp/dup/" });
		seedProject(host, { id: randomUUID(), repoPath: "/tmp/dup" });

		const beforeProjects = host.db.select().from(projects).all().length;
		const beforeWorkspaces = host.db.select().from(workspaces).all().length;

		const first = generateIdentityCollisionReport(host.db);
		const second = generateIdentityCollisionReport(host.db);

		const afterProjects = host.db.select().from(projects).all().length;
		const afterWorkspaces = host.db.select().from(workspaces).all().length;

		expect(afterProjects).toBe(beforeProjects);
		expect(afterWorkspaces).toBe(beforeWorkspaces);
		// Two back-to-back calls must return identical structures — a
		// side effect (e.g. accidental delete/insert) would show here too.
		expect(second).toEqual(first);
		expect(first.duplicateRepoPaths).toHaveLength(1);
	});
});
