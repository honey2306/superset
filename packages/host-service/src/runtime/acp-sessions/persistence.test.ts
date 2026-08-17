import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import { SqliteAcpSessionPersistence } from "./persistence";

describe("SqliteAcpSessionPersistence delegation runs", () => {
	test("creates, queries, lists, and updates durable handoffs", () => {
		const sqlite = new Database(":memory:");
		sqlite.exec(`
			CREATE TABLE delegation_runs (
				id TEXT PRIMARY KEY,
				parent_session_id TEXT NOT NULL,
				parent_workspace_id TEXT NOT NULL,
				child_session_id TEXT NOT NULL UNIQUE,
				child_workspace_id TEXT NOT NULL,
				handoff TEXT NOT NULL,
				actual_agent TEXT,
				actual_model TEXT,
				harness TEXT NOT NULL,
				status TEXT NOT NULL,
				failure_message TEXT,
				created_at INTEGER NOT NULL,
				started_at INTEGER,
				completed_at INTEGER,
				failed_at INTEGER,
				updated_at INTEGER NOT NULL
			);
			CREATE INDEX delegation_runs_parent_session_history_idx
				ON delegation_runs (parent_session_id, created_at);
		`);
		const db = drizzle(sqlite, { schema }) as unknown as HostDb;
		const persistence = new SqliteAcpSessionPersistence(db);

		persistence.createDelegationRun({
			id: "run-1",
			parentSessionId: "parent-1",
			parentWorkspaceId: "workspace-1",
			childSessionId: "child-1",
			childWorkspaceId: "workspace-1",
			handoff: "Implement durable handoffs",
			actualAgent: "codex",
			actualModel: "gpt-5.6-sol",
			harness: "codex-app-server",
			status: "creating",
			failureMessage: null,
			createdAt: 10,
			startedAt: null,
			completedAt: null,
			failedAt: null,
			updatedAt: 10,
		});

		expect(persistence.getDelegationRun("run-1")).toMatchObject({
			childSessionId: "child-1",
			handoff: "Implement durable handoffs",
			status: "creating",
		});
		expect(persistence.listDelegationRunsByParent("parent-1", 10)).toHaveLength(
			1,
		);
		expect(persistence.listActiveDelegationRuns()).toHaveLength(1);

		persistence.updateDelegationRun("run-1", {
			status: "completed",
			completedAt: 20,
			updatedAt: 20,
		});

		expect(persistence.getDelegationRun("run-1")).toMatchObject({
			status: "completed",
			completedAt: 20,
		});
		expect(persistence.listActiveDelegationRuns()).toHaveLength(0);
		sqlite.close();
	});
});
