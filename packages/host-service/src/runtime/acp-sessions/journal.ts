import type {
	ContentBlock,
	RemoteCommandOperation,
	SessionScopedState,
	SessionUpdateEnvelope,
	SessionUpdateFrame,
} from "@superset/session-protocol";

export interface JournalPage {
	/** Matching envelopes in ascending seq order. */
	items: SessionUpdateEnvelope[];
	/** Seq before which the next (older) page starts, or null when exhausted. */
	nextBeforeSeq: number | null;
}

/** Permission requests persisted without a later resolution in the same epoch. */
export function unresolvedPermissionRequestIds(
	entries: SessionUpdateEnvelope[],
): string[] {
	const unresolved = new Set<string>();
	for (const { frame } of entries) {
		if (frame.kind === "permission_requested") {
			unresolved.add(frame.pending.requestId);
		} else if (frame.kind === "permission_resolved") {
			unresolved.delete(frame.requestId);
		}
	}
	return [...unresolved];
}

/**
 * A command which was admitted by the phone but has not yet crossed the ACP
 * prompt boundary. This is deliberately host-local: it is only used while
 * rebuilding a runtime from the durable session journal.
 */
export interface ReplayedRemoteCommand {
	commandId: string;
	operation: RemoteCommandOperation;
	queueId: string;
	prompt: ContentBlock[];
	enqueuedAt: number;
}

export interface ReplayedRemoteCommands {
	/** Ordered tail prompts which should be restored to queuedPrompts. */
	queued: ReplayedRemoteCommand[];
	/** sendNow commands are restored ahead of the ordered tail. */
	sendNow: ReplayedRemoteCommand[];
}

interface RemoteCommandRecord extends ReplayedRemoteCommand {
	status: "queued" | "started";
	queuedSeq: number;
	matchedUserMessage: boolean;
}

/**
 * Rebuild outstanding remote commands from a complete journal replay.
 *
 * A `started` frame is intentionally recoverable: the host may have crashed
 * between reserving the command and journaling its user message. Once a
 * matching command-tagged user update exists, Host admission crossed its
 * durable boundary and the command must not normally be replayed. (ACP itself
 * has no command-id acknowledgement, so provider exactly-once is not claimed.)
 * Finished/removed/superseded commands are deleted from the replay set.
 * Unknown future frames are ignored.
 */
export function replayRemoteCommands(
	entries: readonly SessionUpdateEnvelope[],
): ReplayedRemoteCommands {
	const records = new Map<string, RemoteCommandRecord>();
	const ordered = [...entries].sort((a, b) => a.seq - b.seq);

	for (const envelope of ordered) {
		const frame = envelope.frame;
		if (frame.kind === "remote_command") {
			if (frame.status === "finished") {
				records.delete(frame.commandId);
				continue;
			}
			const existing = records.get(frame.commandId);
			const queueId = frame.queueId ?? existing?.queueId ?? frame.commandId;
			const prompt = frame.prompt ?? existing?.prompt;
			// A recoverable command must carry its payload. A malformed/legacy
			// frame is ignored rather than resurrecting an empty agent turn.
			if (!prompt) continue;
			const enqueuedAt =
				frame.enqueuedAt ?? existing?.enqueuedAt ?? envelope.ts;
			records.set(frame.commandId, {
				commandId: frame.commandId,
				operation: frame.operation,
				queueId,
				prompt: [...prompt],
				enqueuedAt,
				status: frame.status,
				queuedSeq: existing?.queuedSeq ?? envelope.seq,
				matchedUserMessage: existing?.matchedUserMessage ?? false,
			});
			continue;
		}
		if (
			frame.kind === "update" &&
			frame.commandId !== undefined &&
			frame.update.sessionUpdate === "user_message_chunk"
		) {
			const command = records.get(frame.commandId);
			if (command) command.matchedUserMessage = true;
		}
	}

	const outstanding = [...records.values()].filter(
		(command) => command.status === "queued" || !command.matchedUserMessage,
	);
	// The latest sendNow wins if a crash occurred before its supersede frame
	// landed. Older commands remain reserved for idempotency but must not be
	// replayed after the newer cut-in command.
	const sendNow = outstanding
		.filter((command) => command.operation !== "enqueuePrompt")
		.sort((a, b) => a.queuedSeq - b.queuedSeq);
	const queued = outstanding
		.filter((command) => command.operation === "enqueuePrompt")
		.sort((a, b) => a.queuedSeq - b.queuedSeq);
	return {
		queued: queued.map(cloneReplayedCommand),
		sendNow: sendNow.map(cloneReplayedCommand),
	};
}

/**
 * Apply the latest authoritative state queue ordering/edit over command
 * payloads recovered from remote_command frames. The command frames remain
 * the crash boundary; state is only an ordering/content refinement for queue
 * editing operations.
 */
export function orderReplayedRemoteQueue(
	commands: ReplayedRemoteCommand[],
	entries: readonly SessionUpdateEnvelope[],
): ReplayedRemoteCommand[] {
	const latestState = [...entries].reverse().find(
		(
			envelope,
		): envelope is SessionUpdateEnvelope & {
			frame: { kind: "state"; state: SessionScopedState };
		} => envelope.frame.kind === "state",
	)?.frame.state;
	if (!latestState || latestState.queuedPrompts.length === 0) {
		return commands.map(cloneReplayedCommand);
	}
	const byQueueId = new Map(
		commands.map((command) => [command.queueId, command]),
	);
	const ordered: ReplayedRemoteCommand[] = [];
	const seen = new Set<string>();
	for (const queued of latestState.queuedPrompts) {
		const command = byQueueId.get(queued.queueId);
		if (!command || seen.has(command.commandId)) continue;
		seen.add(command.commandId);
		ordered.push({
			...cloneReplayedCommand(command),
			prompt: [...queued.prompt],
			enqueuedAt: queued.enqueuedAt,
		});
	}
	for (const command of commands) {
		if (!seen.has(command.commandId))
			ordered.push(cloneReplayedCommand(command));
	}
	return ordered;
}

function cloneReplayedCommand(
	command: ReplayedRemoteCommand,
): ReplayedRemoteCommand {
	return { ...command, prompt: [...command.prompt] };
}

/**
 * Per-session ring buffer of update envelopes with a gapless, monotonic seq
 * starting at 1. Envelopes older than `capacity` are evicted; `after` reports
 * a no-longer-servable cursor as null so the caller can signal `reset`.
 */
export class SessionJournal {
	private readonly entries: Array<SessionUpdateEnvelope | undefined>;
	private startIndex = 0;
	private size = 0;
	private nextSeq = 1;
	private readonly capacity: number;
	readonly epoch: string;

	constructor(
		options:
			| { epoch: string; capacity?: number; entries?: SessionUpdateEnvelope[] }
			| number = {
			epoch: "legacy",
		},
	) {
		const normalized =
			typeof options === "number"
				? { epoch: "legacy", capacity: options }
				: options;
		const capacity = normalized.capacity ?? 5_000;
		if (!Number.isInteger(capacity) || capacity < 1) {
			throw new Error(
				`journal capacity must be a positive integer: ${capacity}`,
			);
		}
		this.capacity = capacity;
		this.entries = new Array<SessionUpdateEnvelope | undefined>(capacity);
		this.epoch = normalized.epoch;
		for (const envelope of normalized.entries ?? []) this.restore(envelope);
	}

	/** Seq of the newest journaled envelope, or 0 when nothing was journaled. */
	get latestSeq(): number {
		return this.nextSeq - 1;
	}

	/** Oldest retained seq, or 0 when the journal is empty. */
	get oldestSeq(): number {
		return this.size === 0 ? 0 : this.nextSeq - this.size;
	}

	/** Retained envelopes in chronological order for semantic transcript reads. */
	snapshot(): SessionUpdateEnvelope[] {
		const result: SessionUpdateEnvelope[] = [];
		for (let index = 0; index < this.size; index += 1) {
			const envelope = this.entryAt(index);
			if (envelope) result.push(envelope);
		}
		return result;
	}

	append(sessionId: string, frame: SessionUpdateFrame): SessionUpdateEnvelope {
		const envelope = this.prepare(sessionId, frame);
		this.commitPrepared(envelope);
		return envelope;
	}

	/** Build the next envelope without advancing the in-memory journal. */
	prepare(sessionId: string, frame: SessionUpdateFrame): SessionUpdateEnvelope {
		return {
			seq: this.nextSeq,
			epoch: this.epoch,
			sessionId,
			ts: Date.now(),
			frame,
		};
	}

	/** Commit an envelope previously returned by prepare after durable storage. */
	commitPrepared(envelope: SessionUpdateEnvelope): void {
		this.restore(envelope);
	}

	/** Restore a durable row. Never silently skip an invalid row: doing so could
	 * make the next append reuse a primary key that is still present on disk. */
	private restore(envelope: SessionUpdateEnvelope): void {
		if (
			envelope.epoch !== this.epoch ||
			envelope.seq !== this.nextSeq ||
			envelope.seq < 1
		) {
			throw new Error(
				`invalid durable journal sequence: expected ${this.nextSeq} in epoch ${this.epoch}, received ${envelope.seq} in ${envelope.epoch}`,
			);
		}
		this.nextSeq += 1;
		if (this.size < this.capacity) {
			this.entries[(this.startIndex + this.size) % this.capacity] = envelope;
			this.size += 1;
			return;
		}
		this.entries[this.startIndex] = envelope;
		this.startIndex = (this.startIndex + 1) % this.capacity;
	}

	/**
	 * Envelopes with seq > since, oldest first — the catch-up replay for a
	 * subscriber resuming at cursor `since`. Returns null when the cursor is
	 * not servable: part of the range was evicted, or the cursor is ahead of
	 * everything journaled (a stale cursor from a prior session incarnation —
	 * serving [] would leave the client discarding every live envelope as a
	 * duplicate). The client must resync from scratch in both cases.
	 */
	after(since: number): SessionUpdateEnvelope[] | null {
		if (since === this.latestSeq) return [];
		if (since > this.latestSeq) return null;
		const startIndex = since + 1 - this.oldestSeq;
		if (startIndex < 0) return null;
		const result: SessionUpdateEnvelope[] = [];
		for (let index = startIndex; index < this.size; index += 1) {
			const envelope = this.entryAt(index);
			if (envelope) result.push(envelope);
		}
		return result;
	}

	/**
	 * Newest-first pagination: walk backwards from `beforeSeq` (exclusive;
	 * from the newest entry when omitted) collecting up to `limit` envelopes
	 * accepted by `matches`, returned in ascending seq order. `nextBeforeSeq`
	 * is set only when an older matching envelope is still retained.
	 */
	page(options: {
		beforeSeq?: number;
		limit: number;
		matches: (envelope: SessionUpdateEnvelope) => boolean;
		/**
		 * Upper bound for a page payload. The newest matching item is always
		 * returned so callers can report a single oversized frame explicitly.
		 */
		maxBytes?: number;
		measure?: (envelope: SessionUpdateEnvelope) => number;
	}): JournalPage {
		const { beforeSeq, limit, matches, maxBytes, measure } = options;
		const items: SessionUpdateEnvelope[] = [];
		let bytes = 0;
		let nextBeforeSeq: number | null = null;
		for (let index = this.size - 1; index >= 0; index -= 1) {
			const envelope = this.entryAt(index);
			if (!envelope) continue;
			if (beforeSeq !== undefined && envelope.seq >= beforeSeq) continue;
			if (!matches(envelope)) continue;
			const itemBytes = measure?.(envelope) ?? 0;
			if (
				items.length < limit &&
				(maxBytes === undefined ||
					items.length === 0 ||
					bytes + itemBytes <= maxBytes)
			) {
				items.push(envelope);
				bytes += itemBytes;
			} else {
				const oldestCollected = items[items.length - 1];
				nextBeforeSeq = oldestCollected ? oldestCollected.seq : null;
				break;
			}
		}
		items.reverse();
		return { items, nextBeforeSeq };
	}

	/** Entry at a zero-based logical offset from the oldest retained row. */
	private entryAt(index: number): SessionUpdateEnvelope | undefined {
		if (index < 0 || index >= this.size) return undefined;
		return this.entries[(this.startIndex + index) % this.capacity];
	}
}
