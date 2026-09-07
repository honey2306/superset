import type { ContentBlock, RequestPermissionOutcome } from "../acp";
import type {
	AcpSessionsApi,
	PromptAccepted,
	RespondToPermissionResult,
	TranscriptPage,
} from "../api";
import {
	type SessionSubscription,
	type StreamStatus,
	subscribeToSession,
	type WebSocketLike,
} from "../client";
import type { SessionUpdateEnvelope } from "../envelope";
import {
	emptyTimeline,
	type FoldedTimeline,
	foldEnvelope,
	foldEnvelopes,
} from "../fold";
import type { SessionScopedState } from "../state";
import type { TranscriptTurn, TranscriptTurnSummary } from "../transcript";

export const ACP_SESSION_CONTROLLER_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_RESYNC_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 250;
const LAUNCH_RETRY_WINDOW_MS = 30_000;

export interface AcpSessionControllerOptions {
	sessionId: string;
	connectionKey?: string;
	api: AcpSessionsApi;
	streamUrl: string | (() => string | Promise<string>);
	createWebSocket?: (url: string) => WebSocketLike;
	pageSize?: number;
	initiallyLaunching?: boolean;
}

export interface AcpSessionControllerSnapshot {
	state: SessionScopedState | null;
	timeline: FoldedTimeline;
	streamStatus: StreamStatus;
	isLoading: boolean;
	availability: "live" | "retrying" | "unavailable";
	error: Error | null;
	hasOlder: boolean;
	isLoadingOlder: boolean;
	historyError: Error | null;
	totalTurns: number;
	turnIndex: TranscriptTurnSummary[];
	loadedTurnNumbers: number[];
}

export interface AcpSessionControllerActions {
	prompt(blocks: ContentBlock[]): Promise<PromptAccepted>;
	cancel(): Promise<void>;
	respondToPermission(
		requestId: string,
		outcome: RequestPermissionOutcome,
	): Promise<RespondToPermissionResult>;
	setMode(modeId: string): Promise<void>;
	setConfigOption(configId: string, value: string | boolean): Promise<void>;
	refresh(): Promise<void>;
	enqueue(blocks: ContentBlock[]): Promise<{ queueId: string }>;
	sendNow(blocks: ContentBlock[]): Promise<PromptAccepted>;
	steer(blocks: ContentBlock[]): Promise<PromptAccepted>;
	removeQueued(queueId: string): Promise<void>;
	reorderQueue(orderedIds: string[]): Promise<void>;
	editQueued(queueId: string, blocks: ContentBlock[]): Promise<void>;
	clearQueue(): Promise<void>;
}

interface CachedControllerState {
	savedAt: number;
	snapshot: AcpSessionControllerSnapshot;
	envelopes: SessionUpdateEnvelope[];
	turns: TranscriptTurn[];
	olderCursor: string | null;
}

interface PendingPrompt {
	id: string;
	blocks: ContentBlock[];
	baselineSeq: number;
	createdAt: number;
}

const snapshotCache = new Map<string, CachedControllerState>();

export function clearAcpSessionControllerSnapshotCache(): void {
	snapshotCache.clear();
}

function cacheKey(options: AcpSessionControllerOptions): string {
	return `${options.connectionKey ?? ""}\u0000${options.sessionId}`;
}

function passiveState(
	state: SessionScopedState | null,
): SessionScopedState | null {
	return state
		? {
				...state,
				status: "starting",
				pendingPermissions: [],
				queuedPrompts: [],
			}
		: null;
}

function readCache(
	options: AcpSessionControllerOptions,
): CachedControllerState | null {
	const cached = snapshotCache.get(cacheKey(options));
	if (!cached) return null;
	if (Date.now() - cached.savedAt >= ACP_SESSION_CONTROLLER_SNAPSHOT_TTL_MS) {
		snapshotCache.delete(cacheKey(options));
		return null;
	}
	const state = passiveState(cached.snapshot.state);
	return {
		...cached,
		snapshot: {
			...cached.snapshot,
			state,
			timeline: { ...cached.snapshot.timeline, state },
			streamStatus: "connecting",
			error: null,
			availability: "live",
		},
		envelopes: [...cached.envelopes],
		turns: cached.turns.map((turn) => ({ ...turn, items: [...turn.items] })),
	};
}

function asError(cause: unknown): Error {
	return cause instanceof Error ? cause : new Error(String(cause));
}

function isNotFound(cause: unknown): boolean {
	const message = asError(cause).message.toLowerCase();
	return (
		message.includes("not found") || message.includes("unknown acp session")
	);
}

function mergeEnvelopes(
	...groups: readonly SessionUpdateEnvelope[][]
): SessionUpdateEnvelope[] {
	const byIdentity = new Map<string, SessionUpdateEnvelope>();
	for (const envelope of groups.flat()) {
		if (!byIdentity.has(`${envelope.epoch}:${envelope.seq}`)) {
			byIdentity.set(`${envelope.epoch}:${envelope.seq}`, envelope);
		}
	}
	return [...byIdentity.values()].sort((a, b) => a.seq - b.seq);
}

function transcriptEnvelopes(
	turns: readonly { items: SessionUpdateEnvelope[] }[],
): SessionUpdateEnvelope[] {
	return mergeEnvelopes(...turns.map((turn) => turn.items));
}

function blocksEqual(left: ContentBlock, right: ContentBlock): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function overlayPending(
	timeline: FoldedTimeline,
	pending: readonly PendingPrompt[],
): FoldedTimeline {
	if (pending.length === 0) return timeline;
	return {
		...timeline,
		items: [
			...timeline.items,
			...pending.map((item) => ({
				kind: "message" as const,
				id: item.id,
				role: "user" as const,
				blocks: [...item.blocks],
				failed: false,
				startSeq: item.baselineSeq + 1,
				endSeq: item.baselineSeq + 1,
				startedAt: item.createdAt,
				updatedAt: item.createdAt,
			})),
		],
	};
}

/** Framework-agnostic ACP session lifecycle used by React and terminal clients. */
export class AcpSessionController {
	private options: AcpSessionControllerOptions;
	private snapshot: AcpSessionControllerSnapshot;
	private readonly listeners = new Set<() => void>();
	private subscription: SessionSubscription | null = null;
	private generation = 0;
	private started = false;
	private envelopes: SessionUpdateEnvelope[];
	private olderCursor: string | null;
	private readonly loadedTurns = new Map<number, TranscriptTurn>();
	private pendingLoadOlder: Promise<void> | null = null;
	private readonly pendingTurnLoads = new Map<number, Promise<void>>();
	private readonly seenOlderCursors = new Set<string>();
	private pendingPrompts: PendingPrompt[] = [];
	private nextPromptId = 0;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private launchStartedAt: number | null;
	private pendingBatch: SessionUpdateEnvelope[] = [];
	private cancelBatch: (() => void) | null = null;

	readonly actions: AcpSessionControllerActions;

	constructor(options: AcpSessionControllerOptions) {
		this.options = options;
		const cached = readCache(options);
		this.snapshot = cached?.snapshot ?? {
			state: null,
			timeline: emptyTimeline(),
			streamStatus: "connecting",
			isLoading: true,
			availability: "live",
			error: null,
			hasOlder: false,
			isLoadingOlder: false,
			historyError: null,
			totalTurns: 0,
			turnIndex: [],
			loadedTurnNumbers: [],
		};
		this.envelopes = cached?.envelopes ?? [];
		this.olderCursor = cached?.olderCursor ?? null;
		for (const turn of cached?.turns ?? [])
			this.loadedTurns.set(turn.turnNumber, turn);
		this.launchStartedAt = options.initiallyLaunching ? Date.now() : null;
		this.actions = this.createActions();
	}

	private createActions(): AcpSessionControllerActions {
		return {
			prompt: async (blocks) => {
				const pending: PendingPrompt = {
					id: `optimistic-user:${this.options.sessionId}:${++this.nextPromptId}`,
					blocks: [...blocks],
					baselineSeq: Math.max(
						this.snapshot.timeline.lastSeq,
						this.snapshot.state?.lastSeq ?? 0,
					),
					createdAt: Date.now(),
				};
				this.pendingPrompts.push(pending);
				this.emit();
				try {
					return await this.options.api.prompt({
						sessionId: this.options.sessionId,
						prompt: blocks,
					});
				} catch (cause) {
					this.pendingPrompts = this.pendingPrompts.filter(
						(item) => item.id !== pending.id,
					);
					this.emit();
					throw cause;
				}
			},
			cancel: () =>
				this.options.api.cancel({ sessionId: this.options.sessionId }),
			respondToPermission: (requestId, outcome) =>
				this.options.api.respondToPermission({
					sessionId: this.options.sessionId,
					requestId,
					outcome,
				}),
			setMode: (modeId) =>
				this.options.api.setMode({ sessionId: this.options.sessionId, modeId }),
			setConfigOption: (configId, value) =>
				this.options.api.setConfigOption({
					sessionId: this.options.sessionId,
					configId,
					value,
				}),
			refresh: () => this.refresh(),
			enqueue: (blocks) =>
				this.options.api.enqueuePrompt({
					sessionId: this.options.sessionId,
					prompt: blocks,
				}),
			sendNow: (blocks) =>
				this.options.api.sendNow({
					sessionId: this.options.sessionId,
					prompt: blocks,
				}),
			steer: (blocks) => {
				const steer = this.options.api.steerPrompt;
				return steer
					? steer({ sessionId: this.options.sessionId, prompt: blocks })
					: Promise.reject(
							new Error("This host does not support non-interrupting guidance"),
						);
			},
			removeQueued: (queueId) =>
				this.options.api.removeQueuedPrompt({
					sessionId: this.options.sessionId,
					queueId,
				}),
			reorderQueue: (orderedIds) =>
				this.options.api.reorderQueue({
					sessionId: this.options.sessionId,
					orderedIds,
				}),
			editQueued: (queueId, blocks) =>
				this.options.api.editQueuedPrompt({
					sessionId: this.options.sessionId,
					queueId,
					prompt: blocks,
				}),
			clearQueue: () =>
				this.options.api.clearQueue({ sessionId: this.options.sessionId }),
		};
	}

	setOptions(options: AcpSessionControllerOptions): void {
		const transportChanged =
			options.connectionKey !== this.options.connectionKey;
		const launchFinished =
			this.options.initiallyLaunching && !options.initiallyLaunching;
		this.options = options;
		if (options.initiallyLaunching && this.launchStartedAt === null)
			this.launchStartedAt = Date.now();
		if (this.started && (transportChanged || launchFinished))
			void this.refresh();
	}

	getSnapshot = (): AcpSessionControllerSnapshot => ({
		...this.snapshot,
		timeline: overlayPending(this.snapshot.timeline, this.pendingPrompts),
	});

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	async start(): Promise<void> {
		if (this.started) return;
		this.started = true;
		await this.refresh();
	}

	stop(): void {
		this.started = false;
		this.generation += 1;
		this.clearRetry();
		this.cancelBatch?.();
		this.cancelBatch = null;
		this.pendingBatch = [];
		this.subscription?.close();
		this.subscription = null;
	}

	async refresh(): Promise<void> {
		return this.resync(0);
	}

	private async resync(retryAttempt: number): Promise<void> {
		if (!this.started) return;
		const generation = ++this.generation;
		// A reset can arrive while the previous epoch still has a renderer batch
		// scheduled. Cancel and release that batch before attaching the new epoch;
		// otherwise its stale flush exits on the generation guard without clearing
		// `cancelBatch`, permanently blocking every later live envelope.
		this.cancelBatch?.();
		this.cancelBatch = null;
		this.pendingBatch = [];
		if (retryAttempt === 0) this.clearRetry();
		this.subscription?.close();
		this.subscription = null;
		this.patch(
			{
				isLoading: true,
				error: null,
				availability: retryAttempt ? "retrying" : "live",
			},
			false,
		);
		try {
			const state = await this.options.api.get({
				sessionId: this.options.sessionId,
			});
			if (!this.isCurrent(generation)) return;
			const launchElapsed =
				this.launchStartedAt === null
					? Number.POSITIVE_INFINITY
					: Date.now() - this.launchStartedAt;
			if (
				state.status === "offline" &&
				(launchElapsed < LAUNCH_RETRY_WINDOW_MS ||
					Date.now() - state.createdAt < LAUNCH_RETRY_WINDOW_MS)
			) {
				throw new Error("ACP session adapter is still launching");
			}
			// Publish authoritative control state before potentially slow history.
			this.patch({
				state,
				timeline: { ...this.snapshot.timeline, state },
			});
			let envelopes: SessionUpdateEnvelope[];
			if (this.options.api.getTranscript) {
				const page = await this.options.api.getTranscript({
					sessionId: this.options.sessionId,
					limit: 8,
				});
				if (!this.isCurrent(generation)) return;
				this.loadedTurns.clear();
				for (const turn of page.turns)
					this.loadedTurns.set(turn.turnNumber, turn);
				envelopes = transcriptEnvelopes(page.turns);
				this.olderCursor = page.nextCursor;
				this.snapshot = {
					...this.snapshot,
					totalTurns: page.totalTurns,
					turnIndex: [...page.index],
					loadedTurnNumbers: [...this.loadedTurns.keys()].sort((a, b) => a - b),
					hasOlder: page.nextCursor !== null,
				};
			} else {
				const page = await this.options.api.getMessages({
					sessionId: this.options.sessionId,
					limit: this.options.pageSize ?? 200,
				});
				if (!this.isCurrent(generation)) return;
				envelopes = page.items;
				this.olderCursor = page.nextCursor;
				this.snapshot = {
					...this.snapshot,
					hasOlder: page.nextCursor !== null,
				};
			}
			this.envelopes = mergeEnvelopes(envelopes);
			const timeline = foldEnvelopes(
				{ ...emptyTimeline(), state },
				this.envelopes,
			);
			this.patch({
				state,
				timeline: { ...timeline, state },
				isLoading: false,
				error: null,
				availability: "live",
			});
			this.writeCache();
			this.attach(generation, state);
		} catch (cause) {
			if (!this.isCurrent(generation)) return;
			const error = asError(cause);
			const launchElapsed =
				this.launchStartedAt === null
					? Number.POSITIVE_INFINITY
					: Date.now() - this.launchStartedAt;
			const launchRetry =
				(isNotFound(cause) &&
					Boolean(this.options.initiallyLaunching) &&
					launchElapsed < LAUNCH_RETRY_WINDOW_MS) ||
				error.message.includes("still launching");
			this.patch({
				isLoading: false,
				error: launchRetry ? null : error,
				availability:
					retryAttempt >= MAX_RESYNC_RETRIES && !launchRetry
						? "unavailable"
						: "retrying",
			});
			if (retryAttempt < MAX_RESYNC_RETRIES || launchRetry) {
				const delay = launchRetry
					? 1_000
					: RETRY_BASE_DELAY_MS * 2 ** retryAttempt;
				this.retryTimer = setTimeout(() => {
					this.retryTimer = null;
					void this.resync(retryAttempt + 1);
				}, delay);
			}
		}
	}

	loadOlder(): Promise<void> {
		if (this.pendingLoadOlder) return this.pendingLoadOlder;
		const cursor = this.olderCursor;
		if (cursor === null) return Promise.resolve();
		if (this.seenOlderCursors.has(cursor)) return Promise.resolve();
		this.seenOlderCursors.add(cursor);
		const generation = this.generation;
		this.patch({ isLoadingOlder: true, historyError: null });
		const request = this.loadHistoryPage(cursor, generation).finally(() => {
			if (this.pendingLoadOlder === request) this.pendingLoadOlder = null;
			if (this.isCurrent(generation)) this.patch({ isLoadingOlder: false });
		});
		this.pendingLoadOlder = request;
		return request;
	}

	loadTurn(turnNumber: number): Promise<void> {
		if (this.loadedTurns.has(turnNumber) || !this.options.api.getTranscript)
			return Promise.resolve();
		const existing = this.pendingTurnLoads.get(turnNumber);
		if (existing) return existing;
		const generation = this.generation;
		const request = this.options.api
			.getTranscript({
				sessionId: this.options.sessionId,
				targetTurn: turnNumber,
				limit: 1,
			})
			.then((page) => {
				if (this.isCurrent(generation)) this.mergeTranscriptPage(page);
			})
			.catch((cause) => {
				if (this.isCurrent(generation))
					this.patch({ historyError: asError(cause) });
			})
			.finally(() => this.pendingTurnLoads.delete(turnNumber));
		this.pendingTurnLoads.set(turnNumber, request);
		return request;
	}

	private async loadHistoryPage(
		cursor: string,
		generation: number,
	): Promise<void> {
		try {
			if (this.options.api.getTranscript) {
				const page = await this.options.api.getTranscript({
					sessionId: this.options.sessionId,
					cursor,
					limit: 1,
				});
				if (!this.isCurrent(generation)) return;
				this.mergeTranscriptPage(page);
				this.olderCursor = page.nextCursor;
				this.patch({ hasOlder: page.nextCursor !== null });
				return;
			}
			const page = await this.options.api.getMessages({
				sessionId: this.options.sessionId,
				cursor,
				limit: this.options.pageSize ?? 200,
			});
			if (!this.isCurrent(generation)) return;
			this.envelopes = mergeEnvelopes(page.items, this.envelopes);
			this.olderCursor = page.nextCursor;
			this.refold();
			this.patch({ hasOlder: page.nextCursor !== null });
		} catch (cause) {
			this.seenOlderCursors.delete(cursor);
			if (this.isCurrent(generation))
				this.patch({ historyError: asError(cause) });
		}
	}

	private mergeTranscriptPage(page: TranscriptPage): void {
		for (const turn of page.turns) this.loadedTurns.set(turn.turnNumber, turn);
		this.envelopes = mergeEnvelopes(
			this.envelopes,
			transcriptEnvelopes([...this.loadedTurns.values()]),
		);
		this.refold();
		this.patch({
			turnIndex:
				page.index.length > 0 ? [...page.index] : this.snapshot.turnIndex,
			totalTurns: page.totalTurns,
			loadedTurnNumbers: [...this.loadedTurns.keys()].sort((a, b) => a - b),
			historyError: null,
		});
	}

	private attach(generation: number, state: SessionScopedState): void {
		this.subscription = subscribeToSession({
			streamUrl: this.options.streamUrl,
			since: Math.max(state.lastSeq, this.snapshot.timeline.lastSeq),
			epoch: state.epoch,
			createWebSocket: this.options.createWebSocket,
			onStatus: (streamStatus) => {
				if (this.isCurrent(generation))
					this.patch({
						streamStatus,
						availability: streamStatus === "reconnecting" ? "retrying" : "live",
					});
			},
			onEnvelope: (envelope) => this.enqueueEnvelope(envelope, generation),
			onReset: () => {
				if (this.isCurrent(generation)) void this.refresh();
			},
		});
	}

	private enqueueEnvelope(
		envelope: SessionUpdateEnvelope,
		generation: number,
	): void {
		if (!this.isCurrent(generation)) return;
		this.pendingBatch.push(envelope);
		if (this.cancelBatch) return;
		let cancelled = false;
		const flush = () => {
			if (cancelled || !this.isCurrent(generation)) {
				// Release only our own scheduling token. A newer generation may have
				// already installed another batch while this callback was queued.
				if (this.cancelBatch === cancelScheduledBatch) {
					this.cancelBatch = null;
				}
				return;
			}
			this.cancelBatch = null;
			const batch = this.pendingBatch;
			this.pendingBatch = [];
			for (const item of batch) {
				this.envelopes = mergeEnvelopes(this.envelopes, [item]);
				if (
					item.frame.kind === "update" &&
					item.frame.update.sessionUpdate === "user_message_chunk"
				) {
					const block = item.frame.update.content;
					const index = this.pendingPrompts.findIndex(
						(pending) =>
							item.seq > pending.baselineSeq &&
							pending.blocks[0] &&
							blocksEqual(pending.blocks[0], block),
					);
					if (index >= 0) this.pendingPrompts.splice(index, 1);
				}
				this.snapshot = {
					...this.snapshot,
					timeline: foldEnvelope(this.snapshot.timeline, item),
					state:
						item.frame.kind === "state"
							? item.frame.state
							: this.snapshot.state,
				};
				if (
					item.frame.kind === "update" &&
					item.frame.update.sessionUpdate === "user_message_chunk"
				) {
					const nextTurn = this.snapshot.totalTurns + 1;
					this.snapshot = {
						...this.snapshot,
						totalTurns: nextTurn,
						loadedTurnNumbers: [
							...new Set([...this.snapshot.loadedTurnNumbers, nextTurn]),
						],
					};
				}
			}
			this.emit();
			this.writeCache();
		};
		let cancelScheduledBatch = (): void => {
			cancelled = true;
		};
		const animationFrame = (
			globalThis as typeof globalThis & {
				requestAnimationFrame?: (callback: (time: number) => void) => number;
				cancelAnimationFrame?: (id: number) => void;
			}
		).requestAnimationFrame;
		const cancelAnimation = (
			globalThis as typeof globalThis & {
				cancelAnimationFrame?: (id: number) => void;
			}
		).cancelAnimationFrame;
		if (animationFrame && cancelAnimation) {
			const id = animationFrame(flush);
			cancelScheduledBatch = () => {
				cancelled = true;
				cancelAnimation(id);
			};
			this.cancelBatch = cancelScheduledBatch;
		} else {
			const id = setTimeout(flush, 0);
			cancelScheduledBatch = () => {
				cancelled = true;
				clearTimeout(id);
			};
			this.cancelBatch = cancelScheduledBatch;
		}
	}

	private refold(): void {
		const state = this.snapshot.state;
		const timeline = foldEnvelopes(
			{ ...emptyTimeline(), state },
			this.envelopes,
		);
		this.snapshot = {
			...this.snapshot,
			timeline: { ...timeline, state: timeline.state ?? state },
		};
		this.emit();
	}

	private writeCache(): void {
		snapshotCache.set(cacheKey(this.options), {
			savedAt: Date.now(),
			snapshot: this.snapshot,
			envelopes: [...this.envelopes],
			turns: [...this.loadedTurns.values()],
			olderCursor: this.olderCursor,
		});
	}

	private clearRetry(): void {
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.retryTimer = null;
	}

	private isCurrent(generation: number): boolean {
		return this.started && generation === this.generation;
	}

	private patch(
		patch: Partial<AcpSessionControllerSnapshot>,
		cache = true,
	): void {
		this.snapshot = { ...this.snapshot, ...patch };
		this.emit();
		if (cache && !this.snapshot.isLoading) this.writeCache();
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}
