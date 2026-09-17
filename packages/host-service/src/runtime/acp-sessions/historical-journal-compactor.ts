import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { and, asc, eq } from "drizzle-orm";
import type { HostDb } from "../../db";
import { acpSessionJournal, acpSessionTurns } from "../../db/schema";
import type { AcpArtifactReference, AcpArtifactStore } from "./artifact-store";

const COMPACTION_VERSION = 2;
const MARKER_FILE = `historical-journal-compaction-v${COMPACTION_VERSION}.json`;

export interface AcpHistoricalJournalCompactionStats {
	skipped: boolean;
	sessionsScanned: number;
	sessionsUpdated: number;
	rowsScanned: number;
	rowsUpdated: number;
	bytesBefore: number;
	bytesAfter: number;
	uniqueArtifacts: number;
}

export interface CompactHistoricalJournalOptions {
	/** Inspect and report without changing the journal or writing artifact files. */
	dryRun?: boolean;
	/** Test-only seam invoked from inside each session transaction. */
	beforeSessionCommit?: (sessionId: string) => void;
}

const emptyStats = (): AcpHistoricalJournalCompactionStats => ({
	skipped: false,
	sessionsScanned: 0,
	sessionsUpdated: 0,
	rowsScanned: 0,
	rowsUpdated: 0,
	bytesBefore: 0,
	bytesAfter: 0,
	uniqueArtifacts: 0,
});

/**
 * Rewrites legacy oversized images the live path now normalizes before
 * storage: tool-result images in update.rawOutput and pasted prompt images in
 * user_message_chunk frames, in both the journal and the compacted turn
 * records. A journal envelope or transcript turn holding a multi-megabyte
 * inline image can exceed the daemon's socket frame limit, making the session
 * impossible to open until its history is rewritten here.
 */
export class AcpHistoricalJournalCompactor {
	constructor(
		private readonly db: HostDb,
		private readonly artifactStore: AcpArtifactStore,
	) {}

	compact(
		options: CompactHistoricalJournalOptions = {},
	): AcpHistoricalJournalCompactionStats {
		if (!options.dryRun && this.hasCompletionMarker()) {
			return { ...emptyStats(), skipped: true };
		}
		const stats = emptyStats();
		const artifactIds = new Set<string>();
		const sessionIds = [
			...new Set(
				this.db
					.select({ sessionId: acpSessionJournal.sessionId })
					.from(acpSessionJournal)
					.all()
					.map((row) => row.sessionId),
			),
		];

		for (const sessionId of sessionIds) {
			stats.sessionsScanned += 1;
			const rows = this.db
				.select()
				.from(acpSessionJournal)
				.where(eq(acpSessionJournal.sessionId, sessionId))
				.orderBy(asc(acpSessionJournal.seq))
				.all();
			const updates: Array<{ row: (typeof rows)[number]; frameJson: string }> =
				[];

			for (const row of rows) {
				stats.rowsScanned += 1;
				stats.bytesBefore += Buffer.byteLength(row.frameJson);
				const compacted = compactFrame(
					row.frameJson,
					sessionId,
					this.artifactStore,
					options.dryRun ?? false,
				);
				stats.bytesAfter += Buffer.byteLength(compacted.frameJson);
				for (const artifactId of compacted.artifactIds)
					artifactIds.add(artifactId);
				if (compacted.frameJson !== row.frameJson) {
					updates.push({ row, frameJson: compacted.frameJson });
				}
			}

			if (updates.length === 0) continue;
			stats.sessionsUpdated += 1;
			stats.rowsUpdated += updates.length;
			if (options.dryRun) continue;

			this.db.transaction((tx) => {
				for (const update of updates) {
					tx.update(acpSessionJournal)
						.set({ frameJson: update.frameJson })
						.where(
							and(
								eq(acpSessionJournal.sessionId, update.row.sessionId),
								eq(acpSessionJournal.epoch, update.row.epoch),
								eq(acpSessionJournal.seq, update.row.seq),
							),
						)
						.run();
				}
				options.beforeSessionCommit?.(sessionId);
			});
		}

		this.compactTurnRecords(stats, artifactIds, options);
		stats.uniqueArtifacts = artifactIds.size;
		if (!options.dryRun) this.writeCompletionMarker(stats);
		return stats;
	}

	/**
	 * Turn compaction copies user blocks verbatim into acp_session_turns, so a
	 * legacy oversized prompt image survives there even after its journal rows
	 * were deleted. Transcript pages are built from these records.
	 */
	private compactTurnRecords(
		stats: AcpHistoricalJournalCompactionStats,
		artifactIds: Set<string>,
		options: CompactHistoricalJournalOptions,
	): void {
		const rows = this.db
			.select({
				sessionId: acpSessionTurns.sessionId,
				turnNumber: acpSessionTurns.turnNumber,
				userMessageJson: acpSessionTurns.userMessageJson,
				assistantMessageJson: acpSessionTurns.assistantMessageJson,
			})
			.from(acpSessionTurns)
			.orderBy(asc(acpSessionTurns.sessionId), asc(acpSessionTurns.turnNumber))
			.all();
		const updates: Array<{
			sessionId: string;
			turnNumber: number;
			userMessageJson: string;
			assistantMessageJson: string | null;
		}> = [];
		const touchedSessions = new Set<string>();

		for (const row of rows) {
			stats.rowsScanned += 1;
			stats.bytesBefore +=
				Buffer.byteLength(row.userMessageJson) +
				Buffer.byteLength(row.assistantMessageJson ?? "");
			const userMessageJson = compactBlocksJson(
				row.userMessageJson,
				row.sessionId,
				this.artifactStore,
				options.dryRun ?? false,
				artifactIds,
			);
			const assistantMessageJson =
				row.assistantMessageJson === null
					? null
					: compactBlocksJson(
							row.assistantMessageJson,
							row.sessionId,
							this.artifactStore,
							options.dryRun ?? false,
							artifactIds,
						);
			stats.bytesAfter +=
				Buffer.byteLength(userMessageJson) +
				Buffer.byteLength(assistantMessageJson ?? "");
			if (
				userMessageJson === row.userMessageJson &&
				assistantMessageJson === row.assistantMessageJson
			) {
				continue;
			}
			updates.push({
				sessionId: row.sessionId,
				turnNumber: row.turnNumber,
				userMessageJson,
				assistantMessageJson,
			});
			if (!touchedSessions.has(row.sessionId)) {
				touchedSessions.add(row.sessionId);
				stats.sessionsUpdated += 1;
			}
		}

		stats.rowsUpdated += updates.length;
		if (options.dryRun || updates.length === 0) return;
		this.db.transaction((tx) => {
			for (const update of updates) {
				tx.update(acpSessionTurns)
					.set({
						userMessageJson: update.userMessageJson,
						assistantMessageJson: update.assistantMessageJson,
					})
					.where(
						and(
							eq(acpSessionTurns.sessionId, update.sessionId),
							eq(acpSessionTurns.turnNumber, update.turnNumber),
						),
					)
					.run();
			}
		});
	}

	private hasCompletionMarker(): boolean {
		const markerPath = this.markerPath();
		if (!existsSync(markerPath)) return false;
		try {
			const marker = JSON.parse(readFileSync(markerPath, "utf8")) as {
				version?: unknown;
			};
			return marker.version === COMPACTION_VERSION;
		} catch {
			return false;
		}
	}

	private writeCompletionMarker(
		stats: AcpHistoricalJournalCompactionStats,
	): void {
		mkdirSync(this.artifactStore.rootPath, { recursive: true, mode: 0o700 });
		const markerPath = this.markerPath();
		const temporaryPath = path.join(
			this.artifactStore.rootPath,
			`.${MARKER_FILE}.${randomUUID()}.tmp`,
		);
		try {
			writeFileSync(
				temporaryPath,
				JSON.stringify({
					version: COMPACTION_VERSION,
					completedAt: Date.now(),
					stats,
				}),
				{ flag: "wx", mode: 0o600 },
			);
			renameSync(temporaryPath, markerPath);
		} finally {
			rmSync(temporaryPath, { force: true });
		}
	}

	private markerPath(): string {
		return path.join(this.artifactStore.rootPath, MARKER_FILE);
	}
}

function compactFrame(
	frameJson: string,
	sessionId: string,
	artifactStore: AcpArtifactStore,
	dryRun: boolean,
): { frameJson: string; artifactIds: Set<string> } {
	let frame: Record<string, unknown>;
	try {
		const parsed: unknown = JSON.parse(frameJson);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return { frameJson, artifactIds: new Set() };
		}
		frame = parsed as Record<string, unknown>;
	} catch {
		return { frameJson, artifactIds: new Set() };
	}
	const update = frame.update;
	if (
		frame.kind !== "update" ||
		!update ||
		typeof update !== "object" ||
		Array.isArray(update)
	) {
		return { frameJson, artifactIds: new Set() };
	}
	const updateRecord = update as Record<string, unknown>;
	const artifactIds = new Set<string>();
	let nextUpdate = updateRecord;
	if ("rawOutput" in updateRecord && updateRecord.rawOutput !== undefined) {
		const rawOutput = dryRun
			? artifactStore.previewBoundRawOutput(sessionId, updateRecord.rawOutput)
			: artifactStore.boundRawOutput(sessionId, updateRecord.rawOutput);
		for (const id of collectArtifactIds(rawOutput)) artifactIds.add(id);
		if (JSON.stringify(rawOutput) !== JSON.stringify(updateRecord.rawOutput)) {
			nextUpdate = { ...nextUpdate, rawOutput };
		}
	}
	if (
		updateRecord.sessionUpdate === "user_message_chunk" &&
		updateRecord.content !== undefined
	) {
		const content = dryRun
			? artifactStore.previewBoundPromptBlock(sessionId, updateRecord.content)
			: artifactStore.boundPromptBlock(sessionId, updateRecord.content);
		for (const id of collectArtifactIds(content)) artifactIds.add(id);
		if (content !== updateRecord.content) {
			nextUpdate = { ...nextUpdate, content };
		}
	}
	if (nextUpdate === updateRecord) return { frameJson, artifactIds };
	const compactedFrame = { ...frame, update: nextUpdate };
	return { frameJson: JSON.stringify(compactedFrame), artifactIds };
}

/** Bounds every oversized prompt image inside a JSON array of content blocks. */
function compactBlocksJson(
	blocksJson: string,
	sessionId: string,
	artifactStore: AcpArtifactStore,
	dryRun: boolean,
	artifactIds: Set<string>,
): string {
	let blocks: unknown;
	try {
		blocks = JSON.parse(blocksJson);
	} catch {
		return blocksJson;
	}
	if (!Array.isArray(blocks)) return blocksJson;
	let changed = false;
	const nextBlocks = blocks.map((block) => {
		const bounded = dryRun
			? artifactStore.previewBoundPromptBlock(sessionId, block)
			: artifactStore.boundPromptBlock(sessionId, block);
		if (bounded !== block) changed = true;
		for (const id of collectArtifactIds(bounded)) artifactIds.add(id);
		return bounded;
	});
	return changed ? JSON.stringify(nextBlocks) : blocksJson;
}

function collectArtifactIds(value: unknown): Set<string> {
	const paths = new Set<string>();
	const visit = (item: unknown): void => {
		if (Array.isArray(item)) {
			for (const child of item) visit(child);
			return;
		}
		if (!item || typeof item !== "object") return;
		const record = item as Partial<AcpArtifactReference>;
		if (
			record.type === "acp-artifact" &&
			record.locator?.kind === "file" &&
			typeof record.locator.path === "string"
		) {
			paths.add(record.locator.path);
			return;
		}
		for (const child of Object.values(record)) visit(child);
	};
	visit(value);
	return paths;
}
