import type {
	ContentBlock,
	HarnessKind,
	SessionUpdateEnvelope,
	SessionUpdateFrame,
	StopReason,
	SupersetSessionRole,
	ToolCallStatus,
	TranscriptToolSummary,
	TranscriptTurnStatus,
} from "@superset/session-protocol";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { HostDb } from "../../db";
import {
	acpSessionCommands,
	acpSessionJournal,
	acpSessions,
	acpSessionTurns,
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
	role: SupersetSessionRole;
	harness: HarnessKind;
	cwd: string;
	title: string | null;
	lastStopReason: StopReason | null;
	/** Lazily reconstructed from the durable journal; not a database column. */
	lastCompletedAt?: number | null;
	createdAt: number;
	updatedAt: number;
}

/**
 * The durable projection of one terminal turn. It is intentionally independent
 * from the raw journal so closing a tab can remove runtime data while keeping
 * the conversation users may reopen later.
 */
export interface AcpSessionTurnRecord {
	sessionId: string;
	turnNumber: number;
	epoch: string;
	startSeq: number;
	endSeq: number;
	userMessage: ContentBlock[];
	assistantMessage: ContentBlock[] | null;
	status: TranscriptTurnStatus;
	startedAt: number;
	completedAt: number;
	durationMs: number;
	messageCount: number;
	toolCallCount: number;
	toolSummaries: TranscriptToolSummary[];
}

/** A durable, queryable record of a parent session's delegated handoff. */
export interface DelegationRunRecord {
	id: string;
	parentSessionId: string;
	parentWorkspaceId: string;
	childSessionId: string;
	childWorkspaceId: string;
	handoff: string;
	profileId: string | null;
	contextSnapshotJson: string | null;
	resultJson: string | null;
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
			status?: DelegationRunStatus;
			updatedAt: number;
			startedAt?: number | null;
			completedAt?: number | null;
			failedAt?: number | null;
			failureMessage?: string | null;
			resultJson?: string | null;
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
	/** Read compact turns; optional for legacy/in-memory persistence adapters. */
	loadTurns?(sessionId: string): AcpSessionTurnRecord[];
	/** Atomically write compact turns and remove their raw runtime journal. */
	compactTurns?(input: {
		sessionId: string;
		/** New journal incarnation to publish with the compacted boundary. */
		nextEpoch: string;
		turns: AcpSessionTurnRecord[];
	}): void;
	appendEnvelope(envelope: SessionUpdateEnvelope): void;
	/** True only for the first delivery of a client-generated command id. */
	reserveCommand(sessionId: string, commandId: string): boolean;
	/**
	 * Atomically reserve a command and append its recovery envelope. Production
	 * persistence implements this so a Host crash cannot split admission from
	 * the payload needed to recover it. Test/legacy implementations may omit it.
	 */
	reserveCommandAndAppendEnvelope?(
		sessionId: string,
		commandId: string,
		envelope: SessionUpdateEnvelope,
	): boolean;
	releaseCommand(sessionId: string, commandId: string): void;
	deleteSession(sessionId: string): void;
}

function parseJson(raw: string, field: string): unknown {
	try {
		return JSON.parse(raw) as unknown;
	} catch (error) {
		throw new Error(`Invalid ACP compact turn ${field} JSON`, { cause: error });
	}
}

function parseContentBlocks(raw: string, field: string): ContentBlock[] {
	const value = parseJson(raw, field);
	if (!Array.isArray(value)) {
		throw new Error(`Invalid ACP compact turn ${field}: expected an array`);
	}
	return value as ContentBlock[];
}

function parseTranscriptTurnStatus(value: string): TranscriptTurnStatus {
	if (value === "completed" || value === "failed" || value === "cancelled") {
		return value;
	}
	throw new Error(`Invalid ACP compact turn status: ${value}`);
}

function parseToolSummaries(raw: string): TranscriptToolSummary[] {
	const value = parseJson(raw, "toolSummaries");
	if (!Array.isArray(value)) {
		throw new Error(
			"Invalid ACP compact turn toolSummaries: expected an array",
		);
	}
	return value.map((candidate, index) => {
		if (!isRecord(candidate)) {
			throw new Error(`Invalid ACP compact tool summary at index ${index}`);
		}
		const toolCallId = candidate.toolCallId;
		const name = candidate.name;
		const title = candidate.title;
		const status = candidate.status;
		const locations = candidate.locations;
		if (
			typeof toolCallId !== "string" ||
			typeof name !== "string" ||
			typeof title !== "string" ||
			!isToolCallStatus(status) ||
			!Array.isArray(locations)
		) {
			throw new Error(`Invalid ACP compact tool summary at index ${index}`);
		}
		return {
			toolCallId,
			name,
			title,
			status,
			locations: locations.map((location, locationIndex) =>
				parseToolLocation(location, index, locationIndex),
			),
		};
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolCallStatus(value: unknown): value is ToolCallStatus {
	return (
		value === "pending" ||
		value === "in_progress" ||
		value === "completed" ||
		value === "failed"
	);
}

function parseToolLocation(
	value: unknown,
	summaryIndex: number,
	locationIndex: number,
): { path: string; line?: number | null } {
	if (!isRecord(value) || typeof value.path !== "string") {
		throw new Error(
			`Invalid ACP compact tool location at ${summaryIndex}:${locationIndex}`,
		);
	}
	if (
		value.line !== undefined &&
		value.line !== null &&
		(typeof value.line !== "number" || !Number.isFinite(value.line))
	) {
		throw new Error(
			`Invalid ACP compact tool location line at ${summaryIndex}:${locationIndex}`,
		);
	}
	return {
		path: value.path,
		...(value.line !== undefined ? { line: value.line as number | null } : {}),
	};
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
					role: record.role,
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

	loadTurns(sessionId: string): AcpSessionTurnRecord[] {
		return this.db
			.select()
			.from(acpSessionTurns)
			.where(eq(acpSessionTurns.sessionId, sessionId))
			.orderBy(asc(acpSessionTurns.turnNumber))
			.all()
			.map((row) => ({
				sessionId: row.sessionId,
				turnNumber: row.turnNumber,
				epoch: row.epoch,
				startSeq: row.startSeq,
				endSeq: row.endSeq,
				userMessage: parseContentBlocks(row.userMessageJson, "userMessage"),
				assistantMessage: row.assistantMessageJson
					? parseContentBlocks(row.assistantMessageJson, "assistantMessage")
					: null,
				status: parseTranscriptTurnStatus(row.status),
				startedAt: row.startedAt,
				completedAt: row.completedAt,
				durationMs: row.durationMs,
				messageCount: row.messageCount,
				toolCallCount: row.toolCallCount,
				toolSummaries: parseToolSummaries(row.toolSummariesJson),
			}));
	}

	compactTurns(input: {
		sessionId: string;
		nextEpoch: string;
		turns: AcpSessionTurnRecord[];
	}): void {
		this.db.transaction((tx) => {
			for (const turn of input.turns) {
				tx.insert(acpSessionTurns)
					.values({
						sessionId: turn.sessionId,
						turnNumber: turn.turnNumber,
						epoch: turn.epoch,
						startSeq: turn.startSeq,
						endSeq: turn.endSeq,
						userMessageJson: JSON.stringify(turn.userMessage),
						assistantMessageJson: turn.assistantMessage
							? JSON.stringify(turn.assistantMessage)
							: null,
						status: turn.status,
						startedAt: turn.startedAt,
						completedAt: turn.completedAt,
						durationMs: turn.durationMs,
						messageCount: turn.messageCount,
						toolCallCount: turn.toolCallCount,
						toolSummariesJson: JSON.stringify(turn.toolSummaries),
					})
					.onConflictDoUpdate({
						target: [acpSessionTurns.sessionId, acpSessionTurns.turnNumber],
						set: {
							epoch: turn.epoch,
							startSeq: turn.startSeq,
							endSeq: turn.endSeq,
							userMessageJson: JSON.stringify(turn.userMessage),
							assistantMessageJson: turn.assistantMessage
								? JSON.stringify(turn.assistantMessage)
								: null,
							status: turn.status,
							startedAt: turn.startedAt,
							completedAt: turn.completedAt,
							durationMs: turn.durationMs,
							messageCount: turn.messageCount,
							toolCallCount: turn.toolCallCount,
							toolSummariesJson: JSON.stringify(turn.toolSummaries),
						},
					})
					.run();
			}
			// Keep command reservations until the session is explicitly closed.
			// They are the idempotency boundary for retried remote commands; deleting
			// one during ordinary turn compaction could execute a retry twice.
			tx.delete(acpSessionJournal)
				.where(eq(acpSessionJournal.sessionId, input.sessionId))
				.run();
			tx.update(acpSessions)
				.set({ epoch: input.nextEpoch, updatedAt: Date.now() })
				.where(eq(acpSessions.sessionId, input.sessionId))
				.run();
		});
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

	reserveCommandAndAppendEnvelope(
		sessionId: string,
		commandId: string,
		envelope: SessionUpdateEnvelope,
	): boolean {
		return this.db.transaction((tx) => {
			const reserved = tx
				.insert(acpSessionCommands)
				.values({ sessionId, commandId, createdAt: Date.now() })
				.onConflictDoNothing()
				.run();
			if (reserved.changes === 0) return false;
			tx.insert(acpSessionJournal)
				.values({
					sessionId: envelope.sessionId,
					epoch: envelope.epoch,
					seq: envelope.seq,
					ts: envelope.ts,
					frameJson: JSON.stringify(envelope.frame),
				})
				.run();
			return true;
		});
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
