import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import { AcpArtifactStore } from "./artifact-store";
import { AcpHistoricalJournalCompactor } from "./historical-journal-compactor";
import { SqliteAcpSessionPersistence } from "./persistence";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function fixture() {
	const sqlite = new Database(":memory:");
	sqlite.exec(`
		CREATE TABLE acp_session_journal (
			session_id TEXT NOT NULL,
			epoch TEXT NOT NULL,
			seq INTEGER NOT NULL,
			ts INTEGER NOT NULL,
			frame_json TEXT NOT NULL,
			PRIMARY KEY (session_id, epoch, seq)
		);
	`);
	const root = mkdtempSync(path.join(os.tmpdir(), "acp-compaction-"));
	roots.push(root);
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	return {
		sqlite,
		db,
		store: new AcpArtifactStore(path.join(root, "artifacts")),
		compactor: (store: AcpArtifactStore) =>
			new AcpHistoricalJournalCompactor(db, store),
	};
}

function updateFrame(rawOutput: unknown): string {
	return JSON.stringify({
		kind: "update",
		update: { sessionUpdate: "tool_call_update", rawOutput },
	});
}

function insert(
	input: ReturnType<typeof fixture>,
	{
		sessionId = "session-1",
		epoch = "epoch-1",
		seq,
		frameJson,
	}: {
		sessionId?: string;
		epoch?: string;
		seq: number;
		frameJson: string;
	},
): void {
	input.sqlite
		.prepare(
			"INSERT INTO acp_session_journal (session_id, epoch, seq, ts, frame_json) VALUES (?, ?, ?, ?, ?)",
		)
		.run(sessionId, epoch, seq, seq * 10, frameJson);
}

function rows(input: ReturnType<typeof fixture>) {
	return input.sqlite
		.query(
			"SELECT session_id, epoch, seq, ts, frame_json FROM acp_session_journal ORDER BY seq",
		)
		.all() as Array<{
		session_id: string;
		epoch: string;
		seq: number;
		ts: number;
		frame_json: string;
	}>;
}

describe("AcpHistoricalJournalCompactor", () => {
	test("compacts a 31 MB-equivalent legacy frame and preserves journal sequencing", () => {
		const input = fixture();
		const data = Buffer.alloc(24 * 1024 * 1024, 7).toString("base64");
		insert(input, {
			seq: 1,
			frameJson: updateFrame({ type: "image", data, mimeType: "image/png" }),
		});
		insert(input, {
			seq: 2,
			frameJson: updateFrame({ type: "text", text: "after image" }),
		});

		const stats = input.compactor(input.store).compact();
		expect(stats.rowsUpdated).toBe(1);
		expect(stats.bytesAfter).toBeLessThan(stats.bytesBefore / 100);
		const persisted = new SqliteAcpSessionPersistence(input.db).loadJournal(
			"session-1",
			"epoch-1",
		);
		expect(persisted.map((envelope) => envelope.seq)).toEqual([1, 2]);
		expect(persisted.map((envelope) => envelope.ts)).toEqual([10, 20]);
		const rawOutput = (
			persisted[0]?.frame as { update: { rawOutput: { type: string } } }
		).update.rawOutput;
		expect(rawOutput.type).toBe("acp-artifact");
		input.sqlite.close();
	});

	test("deduplicates nested repeated images and leaves small/non-image output alone", () => {
		const input = fixture();
		const data = Buffer.alloc(200_000, 4).toString("base64");
		const untouched = updateFrame({
			imageLike: { type: "image", data: "small", mimeType: "image/png" },
			text: "data:text/plain;base64,AAAA",
			content: [
				{ type: "image", data, mimeType: "image/png" },
				{ nested: { type: "image", data, mimeType: "image/png" } },
			],
		});
		insert(input, { seq: 1, frameJson: untouched });
		const stats = input.compactor(input.store).compact();
		expect(stats.uniqueArtifacts).toBe(1);
		const raw = JSON.parse(rows(input)[0]?.frame_json ?? "{}") as {
			update: {
				rawOutput: {
					content: Array<{ sha256?: string; nested?: { sha256?: string } }>;
					imageLike: { data: string };
				};
			};
		};
		expect(raw.update.rawOutput.content[0]?.sha256).toBe(
			raw.update.rawOutput.content[1]?.nested?.sha256,
		);
		expect(raw.update.rawOutput.imageLike.data).toBe("small");
		input.sqlite.close();
	});

	test("dry runs without mutations and transaction failures retain the original journal", () => {
		const input = fixture();
		const data = Buffer.alloc(200_000, 5).toString("base64");
		const frameJson = updateFrame({
			type: "image",
			data,
			mimeType: "image/png",
		});
		insert(input, { seq: 1, frameJson });
		const compactor = input.compactor(input.store);
		const dryRun = compactor.compact({ dryRun: true });
		expect(dryRun.rowsUpdated).toBe(1);
		expect(rows(input)[0]?.frame_json).toBe(frameJson);
		expect(
			existsSync(
				path.join(
					input.store.rootPath,
					"historical-journal-compaction-v1.json",
				),
			),
		).toBe(false);
		expect(() =>
			compactor.compact({
				beforeSessionCommit: () => {
					throw new Error("rollback");
				},
			}),
		).toThrow("rollback");
		expect(rows(input)[0]?.frame_json).toBe(frameJson);
		expect(
			existsSync(
				path.join(
					input.store.rootPath,
					"historical-journal-compaction-v1.json",
				),
			),
		).toBe(false);
		input.sqlite.close();
	});

	test("is idempotent and skips after the completion marker", () => {
		const input = fixture();
		const data = Buffer.alloc(200_000, 6).toString("base64");
		insert(input, {
			seq: 1,
			frameJson: updateFrame({ type: "image", data, mimeType: "image/png" }),
		});
		const compactor = input.compactor(input.store);
		expect(compactor.compact().rowsUpdated).toBe(1);
		expect(compactor.compact()).toMatchObject({
			skipped: true,
			rowsScanned: 0,
		});
		input.sqlite.close();
	});

	test("does not rewrite journal rows that already use artifact references", () => {
		const input = fixture();
		const data = Buffer.alloc(200_000, 8).toString("base64");
		const reference = input.store.boundRawOutput("session-1", {
			type: "image",
			data,
			mimeType: "image/png",
		});
		const frameJson = updateFrame(reference);
		insert(input, { seq: 1, frameJson });
		insert(input, { seq: 2, frameJson: "{not valid JSON" });
		const stats = input.compactor(input.store).compact();
		expect(stats.rowsUpdated).toBe(0);
		expect(rows(input)[0]?.frame_json).toBe(frameJson);
		expect(rows(input)[1]?.frame_json).toBe("{not valid JSON");
		input.sqlite.close();
	});
});
