import type {
	HarnessKind,
	SessionUpdateEnvelope,
	SessionUpdateFrame,
	StopReason,
} from "@superset/session-protocol";
import { and, asc, eq } from "drizzle-orm";
import type { HostDb } from "../../db";
import {
	acpSessionCommands,
	acpSessionJournal,
	acpSessions,
} from "../../db/schema";

/**
 * One persisted session-registry row — the minimum needed to list a session
 * after a host restart and resurrect it via the adapter's `session/load`.
 * The session's ACP control-plane journal is stored separately and restored
 * into the same epoch before the adapter is attached.
 */
export interface AcpSessionRecord {
	sessionId: string;
	workspaceId: string;
	/** Adapter-side ACP session id — the `session/load` key. */
	acpSessionId: string;
	epoch: string;
	harness: HarnessKind;
	cwd: string;
	title: string | null;
	lastStopReason: StopReason | null;
	createdAt: number;
	updatedAt: number;
}

/**
 * Durable registry behind AcpSessionManager. `loadAll` seeds the manager's
 * offline set at startup; `upsert` runs on every state emit (create, title
 * change, turn end, death) and must be cheap — the manager treats failures
 * as best-effort and never lets them break the live path.
 */
export interface AcpSessionPersistence {
	loadAll(): AcpSessionRecord[];
	upsert(record: AcpSessionRecord): void;
	loadJournal(sessionId: string, epoch: string): SessionUpdateEnvelope[];
	appendEnvelope(envelope: SessionUpdateEnvelope): void;
	/** True only for the first delivery of a client-generated command id. */
	reserveCommand(sessionId: string, commandId: string): boolean;
	releaseCommand(sessionId: string, commandId: string): void;
	deleteSession(sessionId: string): void;
}

export class SqliteAcpSessionPersistence implements AcpSessionPersistence {
	constructor(private readonly db: HostDb) {}

	loadAll(): AcpSessionRecord[] {
		return this.db.select().from(acpSessions).all();
	}

	upsert(record: AcpSessionRecord): void {
		this.db
			.insert(acpSessions)
			.values(record)
			.onConflictDoUpdate({
				target: acpSessions.sessionId,
				set: {
					workspaceId: record.workspaceId,
					acpSessionId: record.acpSessionId,
					epoch: record.epoch,
					harness: record.harness,
					cwd: record.cwd,
					title: record.title,
					lastStopReason: record.lastStopReason,
					createdAt: record.createdAt,
					updatedAt: record.updatedAt,
				},
			})
			.run();
	}

	loadJournal(sessionId: string, epoch: string): SessionUpdateEnvelope[] {
		const rows = this.db
			.select()
			.from(acpSessionJournal)
			.where(eq(acpSessionJournal.sessionId, sessionId))
			.orderBy(asc(acpSessionJournal.seq))
			.all()
			.filter((row) => row.epoch === epoch);
		const envelopes: SessionUpdateEnvelope[] = [];
		let expectedSeq = 1;
		for (const row of rows) {
			if (row.seq !== expectedSeq) {
				throw new Error(
					`ACP journal integrity failure for ${sessionId}/${epoch}: expected seq ${expectedSeq}, found ${row.seq}`,
				);
			}
			try {
				const frame = JSON.parse(row.frameJson) as SessionUpdateFrame;
				if (!frame || typeof frame !== "object" || !("kind" in frame)) {
					throw new Error("frame is not a session update frame");
				}
				envelopes.push({
					sessionId: row.sessionId,
					epoch: row.epoch,
					seq: row.seq,
					ts: row.ts,
					frame,
				});
				expectedSeq += 1;
			} catch (error) {
				// Continuing an epoch with a damaged durable log risks reusing an
				// occupied sequence number. The manager catches this and mints a
				// new epoch, making every old cursor reset safely.
				throw new Error(
					`ACP journal integrity failure for ${sessionId}/${epoch} at seq ${row.seq}`,
					{ cause: error },
				);
			}
		}
		return envelopes;
	}

	appendEnvelope(envelope: SessionUpdateEnvelope): void {
		this.db
			.insert(acpSessionJournal)
			.values({
				sessionId: envelope.sessionId,
				epoch: envelope.epoch,
				seq: envelope.seq,
				ts: envelope.ts,
				frameJson: JSON.stringify(envelope.frame),
			})
			.run();
	}

	reserveCommand(sessionId: string, commandId: string): boolean {
		const result = this.db
			.insert(acpSessionCommands)
			.values({ sessionId, commandId, createdAt: Date.now() })
			.onConflictDoNothing()
			.run();
		return result.changes > 0;
	}

	releaseCommand(sessionId: string, commandId: string): void {
		this.db
			.delete(acpSessionCommands)
			.where(
				and(
					eq(acpSessionCommands.sessionId, sessionId),
					eq(acpSessionCommands.commandId, commandId),
				),
			)
			.run();
	}

	deleteSession(sessionId: string): void {
		this.db.transaction((tx) => {
			tx.delete(acpSessionCommands)
				.where(eq(acpSessionCommands.sessionId, sessionId))
				.run();
			tx.delete(acpSessionJournal)
				.where(eq(acpSessionJournal.sessionId, sessionId))
				.run();
			tx.delete(acpSessions).where(eq(acpSessions.sessionId, sessionId)).run();
		});
	}
}
