import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import type { SessionUpdateEnvelope } from "@superset/session-protocol";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import { AcpSessionManager } from "./acp-sessions";
import { SqliteAcpSessionPersistence } from "./persistence";
import { projectModelHistoryPage } from "./superset-tools";

/**
 * getModelHistory 的验收层：用真实 SqliteAcpSessionPersistence 构造
 * 「已压缩 turn + 原生新尾帧」的会话，验证模型侧历史查询不再依赖
 * 原生 journal（压缩后依然可读）、按整 turn 分页、并正确映射旧版 s 游标。
 */
const SESSION_ID = "session-history";
const FIRST_EPOCH = "epoch-1";
const SECOND_EPOCH = "epoch-2";

function envelope(
	epoch: string,
	seq: number,
	ts: number,
	frame: SessionUpdateEnvelope["frame"],
): SessionUpdateEnvelope {
	return { sessionId: SESSION_ID, epoch, seq, ts, frame };
}

function userFrame(text: string) {
	return {
		kind: "update" as const,
		update: {
			sessionUpdate: "user_message_chunk" as const,
			content: { type: "text" as const, text },
		},
	};
}

function agentFrame(text: string) {
	return {
		kind: "update" as const,
		update: {
			sessionUpdate: "agent_message_chunk" as const,
			content: { type: "text" as const, text },
		},
	};
}

function stateFrame() {
	return {
		kind: "update" as const,
		update: {
			sessionUpdate: "available_commands_update" as const,
			availableCommands: [],
		},
	};
}

function createPersistence(): SqliteAcpSessionPersistence {
	const sqlite = new Database(":memory:");
	sqlite.exec(`
		CREATE TABLE acp_sessions (
			session_id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			acp_session_id TEXT NOT NULL,
			harness TEXT NOT NULL,
			cwd TEXT NOT NULL,
			title TEXT,
			last_stop_reason TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			epoch TEXT NOT NULL DEFAULT 'legacy',
			role TEXT NOT NULL DEFAULT 'root-coordinator'
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
	return new SqliteAcpSessionPersistence(db);
}

function createManager(
	persistence: SqliteAcpSessionPersistence,
): AcpSessionManager {
	return new AcpSessionManager({
		resolveWorkspaceCwd: () => "/tmp/project",
		persistence,
	});
}

function registerSession(persistence: SqliteAcpSessionPersistence): void {
	persistence.upsert({
		sessionId: SESSION_ID,
		workspaceId: "workspace-1",
		acpSessionId: "native-1",
		epoch: FIRST_EPOCH,
		role: "root-coordinator",
		harness: "claude-agent-acp",
		cwd: "/tmp/project",
		title: null,
		lastStopReason: null,
		createdAt: 1,
		updatedAt: 2,
	});
}

/** 压缩一轮对话到 turn 1，再在新 epoch 写一轮原生尾帧。 */
function seedCompactedWithFreshTail(): AcpSessionManager {
	const persistence = createPersistence();
	registerSession(persistence);
	persistence.appendEnvelope(
		envelope(FIRST_EPOCH, 1, 1, userFrame("compact question")),
	);
	persistence.appendEnvelope(
		envelope(FIRST_EPOCH, 2, 2, agentFrame("compact answer")),
	);
	persistence.appendEnvelope(envelope(FIRST_EPOCH, 3, 3, stateFrame()));
	persistence.compactTurns({
		sessionId: SESSION_ID,
		nextEpoch: SECOND_EPOCH,
		turns: [
			{
				sessionId: SESSION_ID,
				turnNumber: 1,
				epoch: FIRST_EPOCH,
				startSeq: 1,
				endSeq: 3,
				userMessage: [{ type: "text", text: "compact question" }],
				assistantMessage: [{ type: "text", text: "compact answer" }],
				status: "completed",
				startedAt: 1,
				completedAt: 3,
				durationMs: 2,
				messageCount: 2,
				toolCallCount: 0,
				toolSummaries: [],
			},
		],
	});
	persistence.appendEnvelope(
		envelope(SECOND_EPOCH, 1, 10, userFrame("raw question")),
	);
	persistence.appendEnvelope(
		envelope(SECOND_EPOCH, 2, 11, agentFrame("raw answer")),
	);
	persistence.appendEnvelope(envelope(SECOND_EPOCH, 3, 12, stateFrame()));
	return createManager(persistence);
}

/** 压缩一轮后，新 epoch 只剩非消息帧——即旧实现返回「空页 + 游标」的形态。 */
function seedCompactedWithStateOnlyTail(): AcpSessionManager {
	const persistence = createPersistence();
	registerSession(persistence);
	persistence.appendEnvelope(
		envelope(FIRST_EPOCH, 1, 1, userFrame("old question")),
	);
	persistence.appendEnvelope(
		envelope(FIRST_EPOCH, 2, 2, agentFrame("old answer")),
	);
	persistence.compactTurns({
		sessionId: SESSION_ID,
		nextEpoch: SECOND_EPOCH,
		turns: [
			{
				sessionId: SESSION_ID,
				turnNumber: 1,
				epoch: FIRST_EPOCH,
				startSeq: 1,
				endSeq: 2,
				userMessage: [{ type: "text", text: "old question" }],
				assistantMessage: [{ type: "text", text: "old answer" }],
				status: "completed",
				startedAt: 1,
				completedAt: 2,
				durationMs: 1,
				messageCount: 2,
				toolCallCount: 0,
				toolSummaries: [],
			},
		],
	});
	persistence.appendEnvelope(envelope(SECOND_EPOCH, 1, 10, stateFrame()));
	return createManager(persistence);
}

function itemTexts(items: unknown[]): string[] {
	return items.map((item) => {
		const frame = (
			item as {
				frame: { update: { content: { text?: string } } };
			}
		).frame;
		return frame.update.content.text ?? "";
	});
}

describe("AcpSessionManager.getModelHistory", () => {
	test("serves compacted turns and the raw tail as whole-turn pages", () => {
		const manager = seedCompactedWithFreshTail();

		const page = manager.getModelHistory({ sessionId: SESSION_ID });

		expect(page.nextCursor).toBeNull();
		// 页内 turns 按时间正序；投影后条目按最新优先。
		expect(page.turns.map((turn) => turn.turnNumber)).toEqual([1, 2]);
		const projected = projectModelHistoryPage(page);
		// 新到旧：原生 turn 的 agent/user 在前，压缩 turn 的内容随后。
		expect(itemTexts(projected.items)).toEqual([
			"raw answer",
			"raw question",
			"compact answer",
			"compact question",
		]);
		expect(projected.nextCursor).toBeNull();
	});

	test("pages older turns with t-cursors", () => {
		const manager = seedCompactedWithFreshTail();

		const first = manager.getModelHistory({
			sessionId: SESSION_ID,
			limit: 1,
		});
		expect(first.turns.map((turn) => turn.turnNumber)).toEqual([2]);
		expect(first.nextCursor).toBe("t2");

		const older = manager.getModelHistory({
			sessionId: SESSION_ID,
			cursor: first.nextCursor ?? undefined,
			limit: 1,
		});
		expect(older.turns.map((turn) => turn.turnNumber)).toEqual([1]);
		expect(older.nextCursor).toBeNull();
	});

	test("maps legacy s-cursors onto whole turns without losing unread content", () => {
		const manager = seedCompactedWithFreshTail();

		// 旧页交付到 seq 2（原生 agent 块）：turn 2 内 seq 1 的用户块仍未读，
		// 映射必须整 turn 重发，宁重复不丢失。
		const partial = manager.getModelHistory({
			sessionId: SESSION_ID,
			cursor: "s2",
		});
		expect(partial.turns.map((turn) => turn.turnNumber)).toEqual([1, 2]);

		// 游标停在 turn 2 的最低帧上：只剩压缩历史。
		const compactOnly = manager.getModelHistory({
			sessionId: SESSION_ID,
			cursor: "s1",
		});
		expect(compactOnly.turns.map((turn) => turn.turnNumber)).toEqual([1]);
		expect(itemTexts(projectModelHistoryPage(compactOnly).items)).toEqual([
			"compact answer",
			"compact question",
		]);
	});

	test("still serves compact history when the raw journal has no message frames", () => {
		const manager = seedCompactedWithStateOnlyTail();

		const page = manager.getModelHistory({ sessionId: SESSION_ID });

		expect(page.turns.map((turn) => turn.turnNumber)).toEqual([1]);
		expect(itemTexts(projectModelHistoryPage(page).items)).toEqual([
			"old answer",
			"old question",
		]);
		expect(page.nextCursor).toBeNull();
	});
});
