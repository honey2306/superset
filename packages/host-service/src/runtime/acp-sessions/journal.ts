import type {
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

	append(sessionId: string, frame: SessionUpdateFrame): SessionUpdateEnvelope {
		const envelope: SessionUpdateEnvelope = {
			seq: this.nextSeq,
			epoch: this.epoch,
			sessionId,
			ts: Date.now(),
			frame,
		};
		this.nextSeq += 1;
		if (this.size < this.capacity) {
			this.entries[(this.startIndex + this.size) % this.capacity] = envelope;
			this.size += 1;
		} else {
			// Replace the oldest slot and advance the logical head. Eviction stays
			// O(1) regardless of capacity; readers address entries logically below.
			this.entries[this.startIndex] = envelope;
			this.startIndex = (this.startIndex + 1) % this.capacity;
		}
		return envelope;
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
