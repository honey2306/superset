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

	test("updateProject bumps revision and writes an 'updated' change row", () => {
		const p = fx.catalog.createProject({
			id: randomUUID(),
			repoPath: "/tmp/wc-u",
			name: "before",
		});
		const changed = fx.catalog.updateProject(p.id, { name: "after" });
		expect(changed?.name).toBe("after");
		const rows = fx.db.select().from(catalogChanges).all();
		expect(rows.map((r) => r.eventType)).toEqual(["created", "updated"]);
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
		expect(snap.projects).toHaveLength(1);
		expect(snap.workspaces).toHaveLength(1);
		expect(snap.revision).toBeGreaterThanOrEqual(2);
		expect(snap.health.unresolvedIdentityConflicts).toBe(0);
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
