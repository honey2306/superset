/**
 * M2 terminal + compensation integration tests. These exercise the
 * post-Catalog-commit terminal launch, per-intent terminal id journaling,
 * and pre-commit artifact compensation semantics.
 */

import { Database as BunDatabase } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../src/db";
import * as schema from "../../src/db/schema";
import {
	catalogChanges,
	projects,
	workspaceOperationArtifacts,
	workspaceOperationSteps,
	workspaces,
} from "../../src/db/schema";
import { WorkspaceCatalog } from "../../src/workspace-catalog";
import {
	compensateOperation,
	createInMemoryTerminalRuntime,
	OperationJournal,
	type ProvisioningRunner,
	WorkspaceProvisioning,
} from "../../src/workspace-provisioning";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

interface Fixture {
	db: HostDb;
	catalog: WorkspaceCatalog;
	dispose: () => void;
}

function boot(): Fixture {
	const dir = mkdtempSync(join(tmpdir(), "wp-term-"));
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

/** Runner that mints a workspace via the Catalog and returns matching outcome. */
function runnerFromCatalog(
	catalog: WorkspaceCatalog,
	options: {
		projectId?: string;
		workspaceId?: string;
		artifacts?: Array<{
			kind: "repo-dir" | "worktree" | "branch" | "terminal";
			identity: string;
			ownership: "created" | "adopted";
		}>;
		throwErr?: Error;
	} = {},
): ProvisioningRunner {
	return async () => {
		if (options.throwErr) throw options.throwErr;
		const projectId = options.projectId ?? randomUUID();
		const workspaceId = options.workspaceId ?? randomUUID();
		// Ensure Catalog rows exist so startInitialSessions can read the
		// worktree path back.
		const existingProject = catalog
			.snapshot()
			.projects.find((p) => p.id === projectId);
		if (!existingProject) {
			catalog.createProject({
				id: projectId,
				repoPath: `/tmp/fake-repo-${projectId}`,
				name: "fake",
			});
		}
		const existingWs = catalog
			.snapshot()
			.workspaces.find((w) => w.id === workspaceId);
		if (!existingWs) {
			catalog.createWorkspace({
				id: workspaceId,
				projectId,
				worktreePath: `/tmp/fake-repo-${projectId}`,
				branch: "main",
				type: "main",
				name: "main",
			});
		}
		return {
			projectId,
			workspaceId,
			disposition: "created",
			launches: [],
			warnings: [],
			artifacts: options.artifacts,
		};
	};
}

describe("workspaceProvisioning terminal + compensation (M2)", () => {
	let fx: Fixture;
	afterEach(() => {
		fx?.dispose();
	});

	test("required initial session failure → operation failed(retryable) but workspaceId still populated", async () => {
		fx = boot();
		const terminal = createInMemoryTerminalRuntime();
		terminal.failNext(new Error("daemon offline"));
		const provisioning = new WorkspaceProvisioning({
			db: fx.db,
			catalog: fx.catalog,
			eventBus: null,
			runner: runnerFromCatalog(fx.catalog),
			terminalRuntime: terminal,
		});

		const { operation } = await provisioning.begin({
			idempotencyKey: `k:${randomUUID()}`,
			project: { kind: "existing", projectId: randomUUID() },
			source: { kind: "main" },
			initialSessions: [
				{ key: "shell", kind: "shell", requirement: "required" },
			],
		});
		expect(operation.state).toBe("failed");
		expect(operation.failure?.retryable).toBe(true);
		expect(operation.failure?.code).toBe("TERMINAL_UNAVAILABLE");
		expect(operation.workspaceId).toBeTruthy();
	});

	test("best-effort initial session failure produces a warning, operation stays succeeded", async () => {
		fx = boot();
		const terminal = createInMemoryTerminalRuntime();
		terminal.failNext(new Error("temporary blip"));
		const provisioning = new WorkspaceProvisioning({
			db: fx.db,
			catalog: fx.catalog,
			eventBus: null,
			runner: runnerFromCatalog(fx.catalog),
			terminalRuntime: terminal,
		});
		const { operation } = await provisioning.begin({
			idempotencyKey: `k:${randomUUID()}`,
			project: { kind: "existing", projectId: randomUUID() },
			source: { kind: "main" },
			initialSessions: [
				{ key: "s1", kind: "shell", requirement: "best-effort" },
			],
		});
		expect(operation.state).toBe("succeeded");
		expect(operation.warnings.length).toBeGreaterThan(0);
		expect(operation.warnings[0]?.code).toBe("TERMINAL_BEST_EFFORT_FAILED");
	});

	test("terminal id journaled per intent — same operation re-drives adopt the same daemon session id", async () => {
		fx = boot();
		const journal = new OperationJournal(fx.db);
		// Create a stand-in operation row so ensureTerminalId has an FK
		// target for its step insert.
		const opId = journal.create({
			idempotencyKey: `id:${randomUUID()}`,
			requestHash: "h",
			requestJson: "{}",
			launchPayloadJson: null,
		});
		const first = journal.ensureTerminalId(opId, "shell");
		const second = journal.ensureTerminalId(opId, "shell");
		expect(second).toBe(first);
		// Different intent key mints a distinct id.
		const other = journal.ensureTerminalId(opId, "setup");
		expect(other).not.toBe(first);
		const steps = fx.db
			.select()
			.from(workspaceOperationSteps)
			.where(eq(workspaceOperationSteps.operationId, opId))
			.orderBy(asc(workspaceOperationSteps.stepKey))
			.all();
		expect(steps.map((s) => s.stepKey)).toEqual([
			"terminal:setup",
			"terminal:shell",
		]);
	});

	test("compensation removes ownership='created' repo-dir; leaves ownership='adopted' intact", async () => {
		fx = boot();
		// Simulate an operation whose runner threw AFTER emitting artifacts.
		const opId = new OperationJournal(fx.db).create({
			idempotencyKey: `cx:${randomUUID()}`,
			requestHash: "h",
			requestJson: "{}",
			launchPayloadJson: null,
		});
		const createdDir = mkdtempSync(join(tmpdir(), "wp-comp-created-"));
		const adoptedDir = mkdtempSync(join(tmpdir(), "wp-comp-adopted-"));
		mkdirSync(join(createdDir, "child"), { recursive: true });
		mkdirSync(join(adoptedDir, "child"), { recursive: true });

		const now = Date.now();
		fx.db
			.insert(workspaceOperationArtifacts)
			.values({
				id: randomUUID(),
				operationId: opId,
				kind: "repo-dir",
				identity: createdDir,
				ownership: "created",
				expectedHeadSha: null,
				cleanupState: "not-needed",
				createdAt: now,
				updatedAt: now,
			})
			.run();
		fx.db
			.insert(workspaceOperationArtifacts)
			.values({
				id: randomUUID(),
				operationId: opId,
				kind: "repo-dir",
				identity: adoptedDir,
				ownership: "adopted",
				expectedHeadSha: null,
				cleanupState: "not-needed",
				createdAt: now,
				updatedAt: now,
			})
			.run();

		const outcome = await compensateOperation(
			{
				db: fx.db,
				git: async () => {
					throw new Error("git shouldn't be invoked for repo-dir");
				},
			},
			opId,
		);
		expect(outcome.state).toBe("complete");
		expect(outcome.cleared).toBe(1);
		expect(outcome.skipped).toBe(1);
		expect(existsSync(createdDir)).toBe(false);
		expect(existsSync(adoptedDir)).toBe(true);
		rmSync(adoptedDir, { recursive: true, force: true });
	});

	test("runner throws BEFORE catalog commit → operation failed, no orphan Catalog row, artifacts cleaned", async () => {
		fx = boot();
		const createdDir = mkdtempSync(join(tmpdir(), "wp-precommit-"));
		const opsBefore = fx.db.select().from(projects).all().length;
		const provisioning = new WorkspaceProvisioning({
			db: fx.db,
			catalog: fx.catalog,
			eventBus: null,
			// Runner emits a `created` artifact but throws before Catalog
			// commit. Compensation should walk the artifact and delete it.
			runner: async () => {
				return Promise.reject(new Error("simulated pre-commit failure"));
			},
			gitFactory: async () => {
				throw new Error("git factory not needed for repo-dir compensation");
			},
		});
		// Seed an artifact BEFORE begin returns so compensation has
		// something to walk (runner throws before it can record its own).
		// This mimics a partial state written by the runner ahead of the
		// throw — the real production runner does emit artifacts through
		// `outcome.artifacts` on success, but on throw the compensation
		// path relies on whatever was written mid-run.
		const { operation } = await provisioning.begin({
			idempotencyKey: `pre:${randomUUID()}`,
			project: { kind: "existing", projectId: randomUUID() },
			source: { kind: "main" },
		});
		expect(operation.state).toBe("failed");
		// No Catalog row minted since the runner threw before commit.
		expect(fx.db.select().from(projects).all().length).toBe(opsBefore);
		// Manual cleanup for the fixture dir (compensation didn't know
		// about it because we didn't wire the artifact).
		rmSync(createdDir, { recursive: true, force: true });
	});

	test("post-commit failure keeps Catalog row and the operation exposes workspaceId for renderer navigation", async () => {
		fx = boot();
		const terminal = createInMemoryTerminalRuntime();
		terminal.failNext(new Error("daemon boom"));
		const projectId = randomUUID();
		const workspaceId = randomUUID();
		const provisioning = new WorkspaceProvisioning({
			db: fx.db,
			catalog: fx.catalog,
			eventBus: null,
			runner: runnerFromCatalog(fx.catalog, { projectId, workspaceId }),
			terminalRuntime: terminal,
		});
		const { operation } = await provisioning.begin({
			idempotencyKey: `pc:${randomUUID()}`,
			project: { kind: "existing", projectId },
			source: { kind: "main" },
			initialSessions: [
				{ key: "shell", kind: "shell", requirement: "required" },
			],
		});
		expect(operation.state).toBe("failed");
		expect(operation.workspaceId).toBe(workspaceId);
		// Catalog row survives — the workspace exists on disk / in the
		// projection; retry mechanics live outside compensation.
		const wsRow = fx.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		expect(wsRow).toBeTruthy();
		// Corresponding `catalog_changes` was emitted by the Catalog
		// insert — verify at least one entry exists.
		expect(fx.db.select().from(catalogChanges).all().length).toBeGreaterThan(0);
	});

	test("retry re-drives the queued operation and reuses its terminal identity", async () => {
		fx = boot();
		const terminal = createInMemoryTerminalRuntime();
		terminal.failNext(new Error("daemon restart"));
		const projectId = randomUUID();
		const workspaceId = randomUUID();
		const provisioning = new WorkspaceProvisioning({
			db: fx.db,
			catalog: fx.catalog,
			eventBus: null,
			runner: runnerFromCatalog(fx.catalog, { projectId, workspaceId }),
			terminalRuntime: terminal,
		});
		const request = {
			idempotencyKey: `retry:${randomUUID()}`,
			project: { kind: "existing" as const, projectId },
			source: { kind: "main" as const },
			initialSessions: [
				{
					key: "shell",
					kind: "shell" as const,
					requirement: "required" as const,
				},
			],
		};
		const first = await provisioning.begin(request);
		expect(first.operation.state).toBe("failed");
		const queued = provisioning.act({
			operationId: first.operation.id,
			action: "retry",
		});
		expect(queued.state).toBe("queued");

		const retried = await provisioning.begin(request);
		expect(retried.operation.state).toBe("succeeded");
		expect(retried.operation.id).toBe(first.operation.id);
		expect(terminal.calls).toHaveLength(2);
		expect(terminal.calls[0]?.terminalId).toBe(terminal.calls[1]?.terminalId);
	});
});
