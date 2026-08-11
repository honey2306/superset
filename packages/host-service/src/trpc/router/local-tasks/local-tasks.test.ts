import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db/db";
import * as schema from "../../../db/schema";
import {
	localAutomationRuns,
	localAutomations,
	localTodos,
	projects,
	workspaces,
} from "../../../db/schema";
import {
	dispatchLocalAutomation,
	dispatchLocalTodo,
	LocalAutomationScheduler,
	resolveLocalWorkspaceId,
} from "../../../runtime/local-automations";
import { appRouter } from "../router";

const migrationsFolder = resolve(import.meta.dir, "../../../../drizzle");
const directories: string[] = [];

afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

function createCaller(db: HostDb) {
	// The local task router reads only host.db for these operations. If a
	// future change reaches the cloud client, this sentinel makes the test fail.
	const noCloud = new Proxy(
		{},
		{
			get: () => {
				throw new Error("cloud access is forbidden");
			},
		},
	);
	return appRouter.createCaller({
		db,
		api: noCloud,
		isAuthenticated: true,
		authKind: "psk",
		organizationId: "offline-test",
	} as never);
}

function openDatabase(path: string) {
	const sqlite = new Database(path);
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, { migrationsFolder });
	return { db, close: () => sqlite.close() };
}

describe("local task routers", () => {
	test("persist todos and automation history across a SQLite restart without cloud access", async () => {
		const directory = mkdtempSync(join(tmpdir(), "host-local-tasks-"));
		directories.push(directory);
		const path = join(directory, "host.db");
		const first = openDatabase(path);
		const caller = createCaller(first.db);
		const todo = await caller.todo.create({
			title: "Offline reminder",
			mode: "manual",
			dueAt: new Date("2030-01-01T10:00:00Z"),
			timezone: "UTC",
		});
		const automation = await caller.automation.create({
			name: "Offline schedule",
			prompt: "Review the local workspace",
			agent: "not-configured",
			v2ProjectId: crypto.randomUUID(),
			rrule: "FREQ=DAILY",
			timezone: "UTC",
			mcpScope: [],
		});
		await caller.todo.markNotified({ id: todo.id });
		await caller.automation.setPrompt({
			id: automation.id,
			prompt: "Updated locally",
		});
		first.close();

		const second = openDatabase(path);
		const restored = createCaller(second.db);
		const todos = await restored.todo.list();
		const automations = await restored.automation.list();
		const versions = await restored.automation.versions.list({
			automationId: automation.id,
		});

		expect(todos).toHaveLength(1);
		expect(todos[0]).toMatchObject({
			id: todo.id,
			notifiedAt: expect.any(Date),
		});
		expect(automations).toHaveLength(1);
		expect(automations[0]).toMatchObject({
			id: automation.id,
			prompt: "Updated locally",
			lastRun: null,
		});
		expect(versions).toHaveLength(2);
		second.close();
	});

	test("scheduler records a local failed run and advances its durable schedule", async () => {
		const directory = mkdtempSync(join(tmpdir(), "host-local-scheduler-"));
		directories.push(directory);
		const opened = openDatabase(join(directory, "host.db"));
		const caller = createCaller(opened.db);
		const automation = await caller.automation.create({
			name: "Due offline schedule",
			prompt: "No workspace is intentionally configured",
			agent: "not-configured",
			v2ProjectId: crypto.randomUUID(),
			rrule: "FREQ=DAILY",
			timezone: "UTC",
			mcpScope: [],
		});
		const tickNow = Date.parse("2030-01-10T10:00:00.000Z");
		// More than one DAILY occurrence behind: advancing from `dueAt` (the
		// old behavior) remains overdue and the next scheduler tick replays it.
		const dueAt = tickNow - 3 * 24 * 60 * 60 * 1_000;
		opened.db
			.update(localAutomations)
			.set({ nextRunAt: dueAt })
			.where(eq(localAutomations.id, automation.id))
			.run();
		const scheduler = new LocalAutomationScheduler(
			() => ({ db: opened.db }) as never,
		);
		await scheduler.tick(tickNow);

		const run = opened.db
			.select()
			.from(localAutomationRuns)
			.where(eq(localAutomationRuns.automationId, automation.id))
			.get();
		const updated = opened.db
			.select()
			.from(localAutomations)
			.where(eq(localAutomations.id, automation.id))
			.get();
		expect(run).toMatchObject({
			status: "dispatch_failed",
			scheduledFor: dueAt,
		});
		expect(updated?.nextRunAt).toBeGreaterThan(tickNow);
		await scheduler.tick(tickNow + 1);
		expect(
			opened.db
				.select()
				.from(localAutomationRuns)
				.where(eq(localAutomationRuns.automationId, automation.id))
				.all(),
		).toHaveLength(1);
		opened.close();
	});

	test("scheduler processes due local todos without relying on the renderer", async () => {
		const directory = mkdtempSync(join(tmpdir(), "host-local-todo-scheduler-"));
		directories.push(directory);
		const opened = openDatabase(join(directory, "host.db"));
		const caller = createCaller(opened.db);
		const dueAt = new Date(Date.now() - 1_000);
		const manual = await caller.todo.create({
			title: "Due local reminder",
			mode: "manual",
			dueAt,
			timezone: "UTC",
		});
		const automatic = await caller.todo.create({
			title: "Due local auto todo",
			mode: "auto",
			dueAt,
			timezone: "UTC",
			v2WorkspaceId: crypto.randomUUID(),
			agent: "not-configured",
			prompt: "Run locally",
		});

		const scheduler = new LocalAutomationScheduler(
			() => ({ db: opened.db }) as never,
		);
		await scheduler.tick(Date.now());

		const updatedManual = opened.db
			.select()
			.from(localTodos)
			.where(eq(localTodos.id, manual.id))
			.get();
		const updatedAutomatic = opened.db
			.select()
			.from(localTodos)
			.where(eq(localTodos.id, automatic.id))
			.get();
		expect(updatedManual).toMatchObject({ status: "notified" });
		expect(updatedAutomatic).toMatchObject({ status: "dispatch_failed" });
		opened.close();
	});

	test("project-only auto tasks resolve the local main workspace without cloud access", async () => {
		const directory = mkdtempSync(join(tmpdir(), "host-project-task-"));
		directories.push(directory);
		const opened = openDatabase(join(directory, "host.db"));
		const projectId = crypto.randomUUID();
		const firstWorkspaceId = crypto.randomUUID();
		const mainWorkspaceId = crypto.randomUUID();
		opened.db
			.insert(projects)
			.values({
				id: projectId,
				repoPath: "/tmp/project-only-task",
				name: "Project-only task",
			})
			.run();
		opened.db
			.insert(workspaces)
			.values([
				{
					id: firstWorkspaceId,
					projectId,
					worktreePath: "/tmp/project-only-task/feature",
					branch: "feature",
					name: "Feature",
					type: "worktree",
					createdAt: 1,
				},
				{
					id: mainWorkspaceId,
					projectId,
					worktreePath: "/tmp/project-only-task",
					branch: "main",
					name: "Main",
					type: "main",
					createdAt: 2,
				},
			])
			.run();
		const caller = createCaller(opened.db);
		const todo = await caller.todo.create({
			title: "Project-only auto todo",
			mode: "auto",
			dueAt: new Date("2030-01-01T10:00:00Z"),
			timezone: "UTC",
			v2ProjectId: projectId,
			agent: "codex",
			prompt: "Run locally",
		});
		const automation = await caller.automation.create({
			name: "Project-only automation",
			prompt: "Run locally",
			agent: "codex",
			v2ProjectId: projectId,
			rrule: "FREQ=DAILY",
			timezone: "UTC",
			mcpScope: [],
		});

		expect(todo.v2WorkspaceId).toBe(mainWorkspaceId);
		expect(automation.v2WorkspaceId).toBe(mainWorkspaceId);
		expect(resolveLocalWorkspaceId(opened.db, null, projectId)).toBe(
			mainWorkspaceId,
		);

		// Simulate a legacy/project-only persisted row. Dispatch re-resolves and
		// saves the main workspace before it reaches the (deliberately absent)
		// agent config; this proves dispatch stays local without requiring a PTY.
		opened.db
			.update(localAutomations)
			.set({ v2WorkspaceId: null })
			.where(eq(localAutomations.id, automation.id))
			.run();
		opened.db
			.update(schema.localTodos)
			.set({ v2WorkspaceId: null })
			.where(eq(schema.localTodos.id, todo.id))
			.run();
		await expect(
			dispatchLocalAutomation(
				{ db: opened.db } as never,
				opened.db
					.select()
					.from(localAutomations)
					.where(eq(localAutomations.id, automation.id))
					.get() as typeof localAutomations.$inferSelect,
			),
		).rejects.toThrow("Workspace worktree no longer exists");
		await expect(
			dispatchLocalTodo(
				{ db: opened.db } as never,
				opened.db
					.select()
					.from(schema.localTodos)
					.where(eq(schema.localTodos.id, todo.id))
					.get() as typeof schema.localTodos.$inferSelect,
			),
		).rejects.toThrow("Workspace worktree no longer exists");
		expect(
			opened.db
				.select({ v2WorkspaceId: localAutomations.v2WorkspaceId })
				.from(localAutomations)
				.where(eq(localAutomations.id, automation.id))
				.get()?.v2WorkspaceId,
		).toBe(mainWorkspaceId);
		expect(
			opened.db
				.select({ v2WorkspaceId: schema.localTodos.v2WorkspaceId })
				.from(schema.localTodos)
				.where(eq(schema.localTodos.id, todo.id))
				.get()?.v2WorkspaceId,
		).toBe(mainWorkspaceId);
		opened.close();
	});

	test("changing an automation to the temporary target drops its old workspace pin", async () => {
		const directory = mkdtempSync(join(tmpdir(), "host-temporary-target-"));
		directories.push(directory);
		const opened = openDatabase(join(directory, "host.db"));
		const repositoryProjectId = crypto.randomUUID();
		const temporaryProjectId = crypto.randomUUID();
		const repositoryWorkspaceId = crypto.randomUUID();
		const temporaryWorkspaceId = crypto.randomUUID();
		opened.db
			.insert(projects)
			.values([
				{
					id: repositoryProjectId,
					repoPath: "/tmp/repository-target",
					name: "Repository target",
				},
				{
					id: temporaryProjectId,
					repoPath: "/tmp/temporary-target",
					name: "Temporary workspace",
					kind: "temporary",
					singletonKey: "default",
				},
			])
			.run();
		opened.db
			.insert(workspaces)
			.values([
				{
					id: repositoryWorkspaceId,
					projectId: repositoryProjectId,
					worktreePath: "/tmp/repository-target",
					branch: "main",
					name: "Main",
					type: "main",
				},
				{
					id: temporaryWorkspaceId,
					projectId: temporaryProjectId,
					worktreePath: "/tmp/temporary-target",
					branch: "main",
					name: "Temporary workspace",
					type: "main",
				},
			])
			.run();
		const caller = createCaller(opened.db);
		const automation = await caller.automation.create({
			name: "Switch target",
			prompt: "Run locally",
			agent: "codex",
			v2ProjectId: repositoryProjectId,
			v2WorkspaceId: repositoryWorkspaceId,
			rrule: "FREQ=DAILY",
			timezone: "UTC",
			mcpScope: [],
		});
		const updated = await caller.automation.update({
			id: automation.id,
			v2ProjectId: temporaryProjectId,
			v2WorkspaceId: null,
		});

		expect(updated.v2ProjectId).toBe(temporaryProjectId);
		expect(updated.v2WorkspaceId).toBeNull();
		expect(resolveLocalWorkspaceId(opened.db, null, temporaryProjectId)).toBe(
			temporaryWorkspaceId,
		);
		const todo = await caller.todo.create({
			title: "Temporary auto todo",
			mode: "auto",
			dueAt: new Date("2030-01-01T10:00:00Z"),
			timezone: "UTC",
			v2ProjectId: temporaryProjectId,
			agent: "codex",
			prompt: "Run in the temporary workspace",
		});
		expect(todo.v2WorkspaceId).toBeNull();
		const updatedTodo = await caller.todo.update({
			id: todo.id,
			title: "Updated temporary auto todo",
		});
		expect(updatedTodo).toMatchObject({
			title: "Updated temporary auto todo",
			v2WorkspaceId: null,
		});
		opened.close();
	});
});
