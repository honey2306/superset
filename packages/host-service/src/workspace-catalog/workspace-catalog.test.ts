import { Database as BunDatabase } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import {
	catalogChanges,
	catalogIdentityConflicts,
	projects,
	pullRequests,
	workspaceOperations,
	workspaces,
} from "../db/schema";
import { runCatalogIdentityBackfill } from "./identity-backfill";
import {
	CatalogIdentityConflictError,
	WorkspaceCatalog,
} from "./workspace-catalog";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

interface Fixture {
	db: HostDb;
	catalog: WorkspaceCatalog;
	dispose: () => void;
}

function boot(): Fixture {
	const dir = mkdtempSync(join(tmpdir(), "wc-test-"));
	const sqlite = new BunDatabase(join(dir, "host.db"), {
		create: true,
		readwrite: true,
	});
	sqlite.exec("PRAGMA journal_mode = WAL");
	sqlite.exec("PRAGMA foreign_keys = ON");
	const drizzled = drizzle(sqlite, { schema });
	migrate(drizzled, { migrationsFolder: MIGRATIONS_FOLDER });
	const db = drizzled as unknown as HostDb;
	const catalog = new WorkspaceCatalog({ db, eventBus: null });
	return {
		db,
		catalog,
		dispose: () => {
			sqlite.close();
			rmSync(dir, { recursive: true, force: true });
		},
	};
}

describe("WorkspaceCatalog", () => {
	let fx: Fixture;
	beforeEach(() => {
		fx = boot();
	});
	afterEach(() => {
		fx.dispose();
	});

	test("createProject writes entity and change row in one commit", () => {
		const p = fx.catalog.createProject({
			id: randomUUID(),
			repoPath: "/tmp/wc-a",
			name: "A",
		});
		expect(p.canonicalRepoPath).not.toBeNull();

		const rows = fx.db.select().from(catalogChanges).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.entityType).toBe("project");
		expect(rows[0]?.eventType).toBe("created");
		expect(rows[0]?.entityId).toBe(p.id);
	});

	test("provisioning receipt and final Catalog change commit atomically", () => {
		const project = fx.catalog.createProject({
			id: randomUUID(),
			repoPath: "/tmp/wc-provisioning",
		});
		const workspace = fx.catalog.createWorkspace({
			id: randomUUID(),
			projectId: project.id,
			worktreePath: "/tmp/wc-provisioning-worktree",
			branch: "feature/atomic",
		});
		const operationId = randomUUID();
		const now = Date.now();
		fx.db
			.insert(workspaceOperations)
			.values({
				id: operationId,
				idempotencyKey: `catalog-atomic:${operationId}`,
				requestHash: "hash",
				requestJson: "{}",
				state: "running",
				stage: "cataloging",
				revision: 2,
				// Model cancellation racing after the entity commit but before the
				// operation receipt. Existing Catalog identity must win.
				cancelRequestedAt: now,
				createdAt: now,
				updatedAt: now,
			})
			.run();
		const beforeChanges = fx.db.select().from(catalogChanges).all().length;

		expect(
			fx.catalog.commitProvisioningOperation(operationId, {
				projectId: project.id,
				workspaceId: workspace.id,
			}),
		).toBe(true);
		const operation = fx.db
			.select()
			.from(workspaceOperations)
			.where(eq(workspaceOperations.id, operationId))
			.get();
		expect(operation?.catalogCommittedAt).toBeNumber();
		expect(operation?.projectId).toBe(project.id);
		expect(operation?.workspaceId).toBe(workspace.id);
		expect(operation?.stage).toBe("starting-runtime");
		expect(operation?.cancelRequestedAt).toBeNull();
		const changes = fx.db.select().from(catalogChanges).all();
		expect(changes).toHaveLength(beforeChanges + 1);
		expect(changes.at(-1)?.entityId).toBe(workspace.id);
		expect(changes.at(-1)?.eventType).toBe("updated");
	});

	test("provisioning receipt refuses missing Catalog identity without partial writes", () => {
		const operationId = randomUUID();
		const now = Date.now();
		fx.db
			.insert(workspaceOperations)
			.values({
				id: operationId,
				idempotencyKey: `catalog-missing:${operationId}`,
				requestHash: "hash",
				requestJson: "{}",
				state: "running",
				stage: "cataloging",
				revision: 2,
				createdAt: now,
				updatedAt: now,
			})
			.run();
		const beforeChanges = fx.db.select().from(catalogChanges).all().length;
		expect(
			fx.catalog.commitProvisioningOperation(operationId, {
				projectId: randomUUID(),
				workspaceId: randomUUID(),
			}),
		).toBe(false);
		const operation = fx.db
			.select()
			.from(workspaceOperations)
			.where(eq(workspaceOperations.id, operationId))
			.get();
		expect(operation?.catalogCommittedAt).toBeNull();
		expect(fx.db.select().from(catalogChanges).all()).toHaveLength(
			beforeChanges,
		);
	});

	test("duplicate canonical repo path throws CatalogIdentityConflictError", () => {
		fx.catalog.createProject({
			id: randomUUID(),
			repoPath: "/tmp/wc-dup",
		});
		expect(() =>
			fx.catalog.createProject({
				id: randomUUID(),
				// Trailing slash still resolves to the same canonical key.
				repoPath: "/tmp/wc-dup/",
			}),
		).toThrow(CatalogIdentityConflictError);
	});

	test("singleton_key partial unique lets many rows have null singletonKey", () => {
		fx.catalog.createProject({
			id: randomUUID(),
			repoPath: "/tmp/wc-x1",
		});
		fx.catalog.createProject({
			id: randomUUID(),
			repoPath: "/tmp/wc-x2",
		});
		// But the fixed 'default' singleton key can only be claimed once.
		fx.catalog.createProject({
			id: randomUUID(),
			kind: "temporary",
			singletonKey: "default",
			repoPath: "/tmp/wc-tmp",
		});
		expect(() =>
			fx.catalog.createProject({
				id: randomUUID(),
				kind: "temporary",
				singletonKey: "default",
				repoPath: "/tmp/wc-tmp2",
			}),
		).toThrow(CatalogIdentityConflictError);
	});

	test("updateProject journals project config changes", () => {
		const p = fx.catalog.createProject({
			id: randomUUID(),
			repoPath: "/tmp/wc-u",
			name: "before",
		});
		const changed = fx.catalog.updateProject(p.id, {
			name: "after",
			sparseCheckoutPaths: '["apps/desktop"]',
		});
		expect(changed?.name).toBe("after");
		expect(changed?.sparseCheckoutPaths).toBe('["apps/desktop"]');
		const rows = fx.db.select().from(catalogChanges).all();
		expect(rows.map((r) => r.eventType)).toEqual(["created", "updated"]);
	});

	test("updateWorkspace journals local-store and suppressed PR metadata", () => {
		const first = fx.catalog.createProject({
			id: randomUUID(),
			repoPath: "/tmp/wc-ws-patch-a",
		});
		const second = fx.catalog.createProject({
			id: randomUUID(),
			repoPath: "/tmp/wc-ws-patch-b",
		});
		const workspace = fx.catalog.createWorkspace({
			projectId: first.id,
			worktreePath: "/tmp/wc-ws-patch-a/tree",
			branch: "feature",
		});

		const changed = fx.catalog.updateWorkspace(workspace.id, {
			projectId: second.id,
			suppressedPullRequestId: null,
		});

		expect(changed?.projectId).toBe(second.id);
		expect(changed?.suppressedPullRequestId).toBeNull();
		const lastChange = fx.db.select().from(catalogChanges).all().at(-1);
		expect(lastChange).toMatchObject({
			entityType: "workspace",
			entityId: workspace.id,
			eventType: "updated",
		});
	});

	test("deleteProject cascades workspace change rows before the project row", () => {
		const p = fx.catalog.createProject({
			id: randomUUID(),
			repoPath: "/tmp/wc-del",
		});
		const w1 = fx.catalog.createWorkspace({
			projectId: p.id,
			worktreePath: "/tmp/wc-del",
			branch: "main",
			type: "main",
			name: "main",
		});
		const w2 = fx.catalog.createWorkspace({
			projectId: p.id,
			worktreePath: "/tmp/wc-del/.wt/f",
			branch: "feature",
			name: "feature",
		});
		fx.catalog.deleteProject(p.id);

		// After delete: no rows in projects or workspaces (FK cascade), and
		// the last three change rows are the two workspace deletes (in
		// stable ID order) followed by the project delete.
		expect(fx.db.select().from(projects).all()).toHaveLength(0);
		expect(fx.db.select().from(workspaces).all()).toHaveLength(0);
		const deletes = fx.db
			.select()
			.from(catalogChanges)
			.all()
			.filter((r) => r.eventType === "deleted");
		expect(deletes.map((r) => r.entityId)).toEqual(
			[w1.id, w2.id].sort().concat([p.id]),
		);
	});

	test("snapshot returns highest revision plus current rows", () => {
		const p = fx.catalog.createProject({
			id: randomUUID(),
			repoPath: "/tmp/wc-snap",
			name: "snap",
		});
		fx.catalog.createWorkspace({
			projectId: p.id,
			worktreePath: "/tmp/wc-snap",
			branch: "main",
			type: "main",
			name: "main",
		});
		const snap = fx.catalog.snapshot();
		expect(snap.schemaVersion).toBe(2);
		expect(snap.projects).toHaveLength(1);
		expect(snap.workspaces).toHaveLength(1);
		expect(snap.revision).toBeGreaterThanOrEqual(2);
		expect(snap.health.unresolvedIdentityConflicts).toBe(0);
	});

	test("catalog-owned fields roundtrip through updated snapshot and changes", () => {
		const first = fx.catalog.createProject({
			id: randomUUID(),
			repoPath: "/tmp/wc-roundtrip-a",
			sparseCheckoutPaths: '["apps/desktop"]',
		});
		const second = fx.catalog.createProject({
			id: randomUUID(),
			repoPath: "/tmp/wc-roundtrip-b",
		});
		const now = Date.now();
		fx.db
			.insert(pullRequests)
			.values({
				id: "pr-roundtrip",
				projectId: second.id,
				repoProvider: "github",
				repoOwner: "superset-sh",
				repoName: "superset",
				prNumber: 42,
				url: "https://github.com/superset-sh/superset/pull/42",
				title: "Roundtrip",
				state: "OPEN",
				headBranch: "feature",
				headSha: "abc123",
				createdAt: now,
				updatedAt: now,
			})
			.run();
		const workspace = fx.catalog.createWorkspace({
			projectId: first.id,
			worktreePath: "/tmp/wc-roundtrip-a/tree",
			branch: "feature",
		});

		fx.catalog.updateProject(first.id, {
			sparseCheckoutPaths: '["apps/desktop","packages/host-service"]',
		});
		fx.catalog.updateWorkspace(workspace.id, {
			projectId: second.id,
			suppressedPullRequestId: "pr-roundtrip",
		});

		const snapshot = fx.catalog.snapshot();
		expect(
			snapshot.projects.find((project) => project.id === first.id),
		).toMatchObject({
			sparseCheckoutPaths: ["apps/desktop", "packages/host-service"],
		});
		expect(
			snapshot.workspaces.find((item) => item.id === workspace.id),
		).toMatchObject({
			projectId: second.id,
			suppressedPullRequestId: "pr-roundtrip",
		});

		const changes = fx.catalog.changes(0, 100).changes;
		const projectChange = [...changes]
			.reverse()
			.find(
				(change) =>
					change.entityType === "project" && change.entityId === first.id,
			);
		const workspaceChange = [...changes]
			.reverse()
			.find(
				(change) =>
					change.entityType === "workspace" && change.entityId === workspace.id,
			);
		expect(projectChange).toMatchObject({
			schemaVersion: 2,
			eventType: "updated",
			snapshot: {
				sparseCheckoutPaths: ["apps/desktop", "packages/host-service"],
			},
		});
		expect(workspaceChange).toMatchObject({
			schemaVersion: 2,
			eventType: "updated",
			snapshot: {
				projectId: second.id,
				suppressedPullRequestId: "pr-roundtrip",
			},
		});
	});

	test("changes replays only entries with revision > cursor and pages honor limit", () => {
		const p = fx.catalog.createProject({
			id: randomUUID(),
			repoPath: "/tmp/wc-changes",
		});
		fx.catalog.createWorkspace({
			projectId: p.id,
			worktreePath: "/tmp/wc-changes",
			branch: "main",
			type: "main",
			name: "main",
		});
		for (let i = 0; i < 5; i++) {
			fx.catalog.createWorkspace({
				projectId: p.id,
				worktreePath: `/tmp/wc-changes/.wt/${i}`,
				branch: `f-${i}`,
				name: `f-${i}`,
			});
		}
		const page = fx.catalog.changes(0, 3);
		expect(page.changes).toHaveLength(3);
		expect(page.hasMore).toBe(true);
		const cursor = page.changes[2]?.revision ?? 0;
		expect(page.nextRevision).toBe(cursor);

		const rest = fx.catalog.changes(page.nextRevision, 100);
		expect(rest.changes.length).toBeGreaterThan(0);
		expect(rest.hasMore).toBe(false);
		expect(page.nextRevision).toBe(page.changes.at(-1)?.revision ?? 0);
	});

	test("recordIdentityConflict is idempotent per (entity, canonical key) triple", () => {
		fx.catalog.recordIdentityConflict({
			entityType: "project",
			entityId: "id-a",
			canonicalKey: "/tmp/dup",
			conflictingId: "id-b",
			reason: "duplicate_canonical_repo_path",
		});
		fx.catalog.recordIdentityConflict({
			entityType: "project",
			entityId: "id-a",
			canonicalKey: "/tmp/dup",
			conflictingId: "id-b",
			reason: "duplicate_canonical_repo_path",
		});
		const rows = fx.db.select().from(catalogIdentityConflicts).all();
		expect(rows).toHaveLength(1);
	});
});

describe("runCatalogIdentityBackfill", () => {
	let fx: Fixture;
	beforeEach(() => {
		fx = boot();
	});
	afterEach(() => {
		fx.dispose();
	});

	test("fills canonical columns on legacy rows and records duplicates without deleting", () => {
		// Seed by writing straight to the tables (not via Catalog) so
		// canonical columns stay null — mimicking pre-M1 rows.
		const now = Date.now();
		const idA = randomUUID();
		const idB = randomUUID();
		fx.db
			.insert(projects)
			.values({
				id: idA,
				repoPath: "/tmp/backfill-a",
				name: "a",
				createdAt: now,
				updatedAt: now,
			})
			.run();
		fx.db
			.insert(projects)
			.values({
				id: idB,
				// Trailing slash — canonicalizes to the same key as A.
				repoPath: "/tmp/backfill-a/",
				name: "b",
				createdAt: now + 1,
				updatedAt: now + 1,
			})
			.run();

		const result = runCatalogIdentityBackfill({
			db: fx.db,
			catalog: fx.catalog,
		});
		expect(result.projectsUpdated).toBe(1);
		expect(result.conflicts).toBe(1);

		// Loser (B, later createdAt) stays present with null canonical.
		const bRow = fx.db
			.select()
			.from(projects)
			.where(eq(projects.id, idB))
			.get();
		expect(bRow?.canonicalRepoPath).toBeNull();
		const conflicts = fx.db.select().from(catalogIdentityConflicts).all();
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]?.entityId).toBe(idB);
	});
});
