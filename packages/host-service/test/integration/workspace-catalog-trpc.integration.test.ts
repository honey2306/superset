/**
 * M1 tRPC boundary tests for `workspaceCatalog.snapshot` / `.changes`.
 *
 * These pin the wire contract the renderer's `WorkspaceCatalogProvider`
 * relies on: snapshot returns the current projection plus the highest
 * revision; `changes` pages forward strictly by revision and never
 * replays entries at or before the cursor.
 *
 * Uses the standard test harness so we exercise the real Hono +
 * SuperJSON transport, not a bare Catalog class call.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { seedProject, seedWorkspace } from "../helpers/seed";

describe("workspaceCatalog tRPC boundary (M1)", () => {
	let host: TestHost | undefined;

	afterEach(async () => {
		if (host) {
			await host.dispose();
			host = undefined;
		}
	});

	test("snapshot: empty db → empty rows + revision 0 + zero unresolved conflicts", async () => {
		host = await createTestHost();
		const snapshot = await host.trpc.workspaceCatalog.snapshot.query();
		expect(snapshot.schemaVersion).toBe(2);
		expect(snapshot.revision).toBe(0);
		expect(snapshot.projects).toEqual([]);
		expect(snapshot.workspaces).toEqual([]);
		expect(snapshot.health.unresolvedIdentityConflicts).toBe(0);
	});

	test("snapshot: legacy rows seeded via drizzle appear immediately (identity backfill filled canonical columns at startup)", async () => {
		host = await createTestHost();
		const { id: projectId } = seedProject(host, { repoPath: "/tmp/wc-trpc-a" });
		seedWorkspace(host, {
			projectId,
			worktreePath: "/tmp/wc-trpc-a",
			branch: "main",
			type: "main",
		});
		const snapshot = await host.trpc.workspaceCatalog.snapshot.query();
		expect(snapshot.projects.map((p) => p.id)).toEqual([projectId]);
		expect(snapshot.workspaces.map((w) => w.projectId)).toEqual([projectId]);
	});

	test("changes: replays only rows with revision strictly greater than cursor", async () => {
		host = await createTestHost();
		// The Catalog module's write API is internal to host-service (no
		// dedicated tRPC surface — production writes come from
		// project.create / workspaces.create). Instantiate it directly
		// against the same DB to emit deterministic change rows without a
		// real git worktree fixture.
		const { WorkspaceCatalog } = await import(
			"../../src/workspace-catalog/workspace-catalog"
		);
		const cat = new WorkspaceCatalog({ db: host.db, eventBus: null });
		const a = cat.createProject({ repoPath: "/tmp/wc-trpc-b", name: "a" });
		const b = cat.createProject({ repoPath: "/tmp/wc-trpc-c", name: "b" });
		const wsRow = cat.createWorkspace({
			projectId: a.id,
			worktreePath: "/tmp/wc-trpc-b",
			branch: "main",
			type: "main",
			name: "main",
		});

		const initial = await host.trpc.workspaceCatalog.changes.query({
			afterRevision: 0,
		});
		// 3 writes → 3 change rows.
		expect(initial.changes.length).toBe(3);
		expect(initial.hasMore).toBe(false);
		// Rows returned in ascending revision order.
		expect(initial.changes.map((c) => c.eventType)).toEqual([
			"created",
			"created",
			"created",
		]);
		const idsInOrder = initial.changes.map((c) => c.entityId);
		expect(idsInOrder).toContain(a.id);
		expect(idsInOrder).toContain(b.id);
		expect(idsInOrder).toContain(wsRow.id);

		// Cursor past the first change: only the tail should return.
		const tail = await host.trpc.workspaceCatalog.changes.query({
			afterRevision: initial.changes[0].revision,
		});
		expect(tail.changes.length).toBe(2);
		expect(
			tail.changes.every((c) => c.revision > initial.changes[0].revision),
		).toBe(true);
	});

	test("changes: pagination surfaces hasMore + nextRevision", async () => {
		host = await createTestHost();
		const { WorkspaceCatalog } = await import(
			"../../src/workspace-catalog/workspace-catalog"
		);
		const cat = new WorkspaceCatalog({ db: host.db, eventBus: null });
		// Enough writes to force hasMore=true when limit is small.
		for (let i = 0; i < 5; i++) {
			cat.createProject({ repoPath: `/tmp/wc-page-${i}`, name: `p${i}` });
		}
		const page1 = await host.trpc.workspaceCatalog.changes.query({
			afterRevision: 0,
			limit: 3,
		});
		expect(page1.changes.length).toBe(3);
		expect(page1.hasMore).toBe(true);
		expect(page1.nextRevision).toBe(page1.changes[2].revision);
		const page2 = await host.trpc.workspaceCatalog.changes.query({
			afterRevision: page1.nextRevision,
			limit: 3,
		});
		expect(page2.hasMore).toBe(false);
		expect(page2.changes.length).toBe(2);
	});

	test("deleteProject cascades: emits workspace deletes then a project delete change", async () => {
		host = await createTestHost();
		const { WorkspaceCatalog } = await import(
			"../../src/workspace-catalog/workspace-catalog"
		);
		const cat = new WorkspaceCatalog({ db: host.db, eventBus: null });
		const p = cat.createProject({ repoPath: "/tmp/wc-del", name: "del" });
		const w1 = cat.createWorkspace({
			projectId: p.id,
			worktreePath: "/tmp/wc-del/one",
			branch: "b1",
			name: "b1",
		});
		const w2 = cat.createWorkspace({
			projectId: p.id,
			worktreePath: "/tmp/wc-del/two",
			branch: "b2",
			name: "b2",
		});
		cat.deleteProject(p.id);

		const all = await host.trpc.workspaceCatalog.changes.query({
			afterRevision: 0,
		});
		const deletes = all.changes.filter((c) => c.eventType === "deleted");
		// Two workspace deletes emitted before the project delete, all in
		// one SQLite transaction (execplan §Catalog change journal).
		const workspaceDeletes = deletes.filter(
			(c) => c.entityType === "workspace",
		);
		const projectDeletes = deletes.filter((c) => c.entityType === "project");
		expect(workspaceDeletes.length).toBe(2);
		expect(projectDeletes.length).toBe(1);
		expect(workspaceDeletes.map((c) => c.entityId).sort()).toEqual(
			[w1.id, w2.id].sort(),
		);
		expect(projectDeletes[0]?.entityId).toBe(p.id);
		// Project delete revision strictly greater than both workspace
		// deletes (stable ordering within the transaction).
		const projectDeleteRev = projectDeletes[0]?.revision ?? 0;
		expect(workspaceDeletes.every((c) => c.revision < projectDeleteRev)).toBe(
			true,
		);
	});
});
