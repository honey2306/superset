import type {
	HarnessKind,
	SessionUpdateEnvelope,
	SessionUpdateFrame,
	StopReason,
} from "@superset/session-protocol";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { HostDb } from "../../db";
import {
	acpSessionCommands,
	acpSessionJournal,
	acpSessions,
	type DelegationRunStatus,
	delegationRuns,
} from "../../db/schema";
import type { AcpArtifactStore } from "./artifact-store";
import {
	type AcpHistoricalJournalCompactionStats,
	AcpHistoricalJournalCompactor,
	type CompactHistoricalJournalOptions,
} from "./historical-journal-compactor";

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
	/** Lazily reconstructed from the durable journal; not a database column. */
	lastCompletedAt?: number | null;
	createdAt: number;
	updatedAt: number;
}

/** A durable, queryable record of a parent session's delegated handoff. */
export interface DelegationRunRecord {
	id: string;
	parentSessionId: string;
	parentWorkspaceId: string;
	childSessionId: string;
	childWorkspaceId: string;
	handoff: string;
	actualAgent: string | null;
	actualModel: string | null;
	harness: HarnessKind;
	status: DelegationRunStatus;
	failureMessage: string | null;
	createdAt: number;
	startedAt: number | null;
	completedAt: number | null;
	failedAt: number | null;
	updatedAt: number;
}

export interface DelegationRunPersistence {
	createDelegationRun(record: DelegationRunRecord): void;
	updateDelegationRun(
		id: string,
		update: {
			status: DelegationRunStatus;
			updatedAt: number;
			startedAt?: number | null;
			completedAt?: number | null;
			failedAt?: number | null;
			failureMessage?: string | null;
		},
	): void;
	getDelegationRun(id: string): DelegationRunRecord | null;
	listDelegationRunsByParent(
		parentSessionId: string,
		limit: number,
	): DelegationRunRecord[];
	listActiveDelegationRuns(): DelegationRunRecord[];
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

export class SqliteAcpSessionPersistence
	implements AcpSessionPersistence, DelegationRunPersistence
{
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

	compactHistoricalJournal(
		artifactStore: AcpArtifactStore,
		options: CompactHistoricalJournalOptions = {},
	): AcpHistoricalJournalCompactionStats {
		return new AcpHistoricalJournalCompactor(this.db, artifactStore).compact(
			options,
		);
	}

	createDelegationRun(record: DelegationRunRecord): void {
		this.db.insert(delegationRuns).values(record).run();
	}

	updateDelegationRun(
		id: string,
		update: {
			status: DelegationRunStatus;
			updatedAt: number;
			startedAt?: number | null;
			completedAt?: number | null;
			failedAt?: number | null;
			failureMessage?: string | null;
		},
	): void {
		this.db
			.update(delegationRuns)
			.set(update)
			.where(eq(delegationRuns.id, id))
			.run();
	}

	getDelegationRun(id: string): DelegationRunRecord | null {
		return (
			this.db
				.select()
				.from(delegationRuns)
				.where(eq(delegationRuns.id, id))
				.get() ?? null
		);
	}

	listDelegationRunsByParent(
		parentSessionId: string,
		limit: number,
	): DelegationRunRecord[] {
		return this.db
			.select()
			.from(delegationRuns)
			.where(eq(delegationRuns.parentSessionId, parentSessionId))
			.orderBy(desc(delegationRuns.createdAt))
			.limit(limit)
			.all();
	}

	listActiveDelegationRuns(): DelegationRunRecord[] {
		return this.db
			.select()
			.from(delegationRuns)
			.where(inArray(delegationRuns.status, ["creating", "running"]))
			.orderBy(asc(delegationRuns.createdAt))
			.all();
	}
}
