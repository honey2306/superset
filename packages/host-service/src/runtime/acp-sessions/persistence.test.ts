import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import { SqliteAcpSessionPersistence } from "./persistence";

describe("SqliteAcpSessionPersistence delegation runs", () => {
	test("atomically reserves a command with its recovery envelope", () => {
		const sqlite = new Database(":memory:");
		sqlite.exec(`
			CREATE TABLE acp_session_commands (
				session_id TEXT NOT NULL,
				command_id TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				PRIMARY KEY (session_id, command_id)
			);
			CREATE TABLE acp_session_journal (
				session_id TEXT NOT NULL,
				epoch TEXT NOT NULL,
				seq INTEGER NOT NULL,
				ts INTEGER NOT NULL,
				frame_json TEXT NOT NULL,
				PRIMARY KEY (session_id, epoch, seq)
			);
		`);
		const db = drizzle(sqlite, { schema }) as unknown as HostDb;
		const persistence = new SqliteAcpSessionPersistence(db);
		const envelope = {
			sessionId: "session-1",
			epoch: "epoch-1",
			seq: 1,
			ts: 10,
			frame: {
				kind: "remote_command" as const,
				commandId: "command-1",
				operation: "enqueuePrompt" as const,
				status: "queued" as const,
				prompt: [{ type: "text" as const, text: "hello" }],
			},
		};

		expect(
			persistence.reserveCommandAndAppendEnvelope(
				"session-1",
				"command-1",
				envelope,
			),
		).toBe(true);
		expect(
			persistence.reserveCommandAndAppendEnvelope("session-1", "command-1", {
				...envelope,
				seq: 2,
			}),
		).toBe(false);
		expect(persistence.loadJournal("session-1", "epoch-1")).toEqual([envelope]);

		// A journal constraint failure rolls back the reservation in the same
		// SQLite transaction, so a later retry is not permanently suppressed.
		expect(() =>
			persistence.reserveCommandAndAppendEnvelope("session-1", "command-2", {
				...envelope,
				frame: { ...envelope.frame, commandId: "command-2" },
			}),
		).toThrow();
		expect(persistence.reserveCommand("session-1", "command-2")).toBe(true);
		sqlite.close();
	});

	test("writes compact turns and removes raw journal atomically", () => {
		const sqlite = new Database(":memory:");
		sqlite.exec(`
			CREATE TABLE acp_sessions (
				session_id TEXT PRIMARY KEY,
				epoch TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			);
			CREATE TABLE acp_session_commands (
				session_id TEXT NOT NULL,
				command_id TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				PRIMARY KEY (session_id, command_id)
			);
			CREATE TABLE acp_session_journal (
				session_id TEXT NOT NULL,
				epoch TEXT NOT NULL,
				seq INTEGER NOT NULL,
				ts INTEGER NOT NULL,
				frame_json TEXT NOT NULL,
				PRIMARY KEY (session_id, epoch, seq)
			);
			CREATE TABLE acp_session_turns (
				session_id TEXT NOT NULL,
				turn_number INTEGER NOT NULL,
				epoch TEXT NOT NULL,
				start_seq INTEGER NOT NULL,
				end_seq INTEGER NOT NULL,
				user_message_json TEXT NOT NULL,
				assistant_message_json TEXT,
				status TEXT NOT NULL,
				started_at INTEGER NOT NULL,
				completed_at INTEGER NOT NULL,
				duration_ms INTEGER NOT NULL,
				message_count INTEGER NOT NULL,
				tool_call_count INTEGER NOT NULL,
				tool_summaries_json TEXT NOT NULL DEFAULT '[]',
				PRIMARY KEY (session_id, turn_number)
			);
		`);
		const db = drizzle(sqlite, { schema }) as unknown as HostDb;
		const persistence = new SqliteAcpSessionPersistence(db);
		const sessionId = "session-compact";
		sqlite
			.query(
				"INSERT INTO acp_sessions (session_id, epoch, updated_at) VALUES (?, ?, ?)",
			)
			.run(sessionId, "epoch-1", 10);
		sqlite
			.query(
				"INSERT INTO acp_session_commands (session_id, command_id, created_at) VALUES (?, ?, ?)",
			)
			.run(sessionId, "command-1", 10);
		sqlite
			.query(
				"INSERT INTO acp_session_journal (session_id, epoch, seq, ts, frame_json) VALUES (?, ?, ?, ?, ?)",
			)
			.run(sessionId, "epoch-1", 1, 10, '{"kind":"state"}');

		persistence.compactTurns({
			sessionId,
			nextEpoch: "epoch-2",
			turns: [
				{
					sessionId,
					turnNumber: 1,
					epoch: "epoch-1",
					startSeq: 1,
					endSeq: 4,
					userMessage: [{ type: "text", text: "hello" }],
					assistantMessage: [{ type: "text", text: "world" }],
					status: "completed",
					startedAt: 10,
					completedAt: 40,
					durationMs: 30,
					messageCount: 1,
					toolCallCount: 1,
					toolSummaries: [
						{
							toolCallId: "tool-1",
							name: "read",
							title: "/tmp/example.ts",
							status: "completed",
							locations: [{ path: "/tmp/example.ts", line: 3 }],
						},
					],
				},
			],
		});

		expect(persistence.loadTurns(sessionId)).toEqual([
			{
				sessionId,
				turnNumber: 1,
				epoch: "epoch-1",
				startSeq: 1,
				endSeq: 4,
				userMessage: [{ type: "text", text: "hello" }],
				assistantMessage: [{ type: "text", text: "world" }],
				status: "completed",
				startedAt: 10,
				completedAt: 40,
				durationMs: 30,
				messageCount: 1,
				toolCallCount: 1,
				toolSummaries: [
					{
						toolCallId: "tool-1",
						name: "read",
						title: "/tmp/example.ts",
						status: "completed",
						locations: [{ path: "/tmp/example.ts", line: 3 }],
					},
				],
			},
		]);
		expect(
			sqlite
				.query("SELECT epoch FROM acp_sessions WHERE session_id = ?")
				.get(sessionId),
		).toEqual({ epoch: "epoch-2" });
		expect(persistence.loadJournal(sessionId, "epoch-1")).toEqual([]);
		expect(
			sqlite.query("SELECT COUNT(*) AS count FROM acp_session_commands").get(),
		).toEqual({ count: 1 });
		sqlite.close();
	});

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
				profile_id TEXT,
				context_snapshot_json TEXT,
				result_json TEXT,
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
			profileId: "default",
			contextSnapshotJson: '{"summary":"Existing context"}',
			resultJson: null,
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
			profileId: "default",
			contextSnapshotJson: '{"summary":"Existing context"}',
			resultJson: null,
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
