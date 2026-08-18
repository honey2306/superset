import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContentBlock, RequestPermissionOutcome } from "../../acp";
import type {
	AcpSessionsApi,
	PromptAccepted,
	RespondToPermissionResult,
} from "../../api";
import {
	type SessionSubscription,
	type StreamStatus,
	subscribeToSession,
	type WebSocketLike,
} from "../../client";
import type { SessionUpdateEnvelope } from "../../envelope";
import {
	emptyTimeline,
	type FoldedTimeline,
	foldEnvelope,
	foldEnvelopes,
} from "../../fold";
import type { SessionScopedState } from "../../state";

export interface UseAcpSessionOptions {
	sessionId: string;
	/**
	 * Stable identity of the host transport (for example its base URL). A host
	 * restart can replace the API/socket while keeping the same session id; in
	 * that case an exhausted retry budget belongs to the old transport only.
	 */
	connectionKey?: string;
	/** Transport for commands + catch-up reads (a tRPC client fits). */
	api: AcpSessionsApi;
	/**
	 * WS endpoint for this session's update stream. Pass a function when the
	 * URL embeds a short-lived token — it is re-invoked on every reconnect.
	 */
	streamUrl: string | (() => string | Promise<string>);
	/** Injectable for tests / non-global WebSocket environments. */
	createWebSocket?: (url: string) => WebSocketLike;
	/** Number of newest historical envelopes fetched per page (default 200). */
	pageSize?: number;
	/**
	 * Whether this consumer is actively displaying the session. Disabled
	 * consumers retain their last rendered state, but do not fetch or subscribe
	 * until re-enabled. Defaults to true for non-pane callers.
	 */
	enabled?: boolean;
	/**
	 * The caller just requested this session id and the host may still be
	 * starting its adapter. During this bounded period, a 404 is expected.
	 */
	initiallyLaunching?: boolean;
}

export interface AcpSessionActions {
	/** Acks admission; turn completion arrives via state frames (see api.ts). */
	prompt(blocks: ContentBlock[]): Promise<PromptAccepted>;
	cancel(): Promise<void>;
	respondToPermission(
		requestId: string,
		outcome: RequestPermissionOutcome,
	): Promise<RespondToPermissionResult>;
	setMode(modeId: string): Promise<void>;
	setConfigOption(configId: string, value: string | boolean): Promise<void>;
	/** Full resync: re-fetch state + the newest history page, then resubscribe. */
	refresh(): Promise<void>;

	/** Append a follow-up prompt to the host-managed queue. */
	enqueue(blocks: ContentBlock[]): Promise<{ queueId: string }>;
	/**
	 * Cancel the current turn (if any) and immediately run this prompt.
	 * Idle sessions behave like `prompt`.
	 */
	sendNow(blocks: ContentBlock[]): Promise<PromptAccepted>;
	removeQueued(queueId: string): Promise<void>;
	/** Full reorder — pass every current queueId in the intended order. */
	reorderQueue(orderedIds: string[]): Promise<void>;
	editQueued(queueId: string, blocks: ContentBlock[]): Promise<void>;
	clearQueue(): Promise<void>;
}

export interface UseAcpSessionResult {
	/** Live session-scoped state (status, pending permissions, modes...). */
	state: SessionScopedState | null;
	/** Folded, render-ready timeline of loaded history + live updates. */
	timeline: FoldedTimeline;
	streamStatus: StreamStatus;
	/** True during the initial (or refresh) resync round-trip. */
	isLoading: boolean;
	/** Whether the current session transport is live, retrying, or exhausted. */
	availability: "live" | "retrying" | "unavailable";
	error: Error | null;
	/** More historical messages are available before the currently loaded page. */
	hasOlder: boolean;
	/** True while an older history page is being fetched. */
	isLoadingOlder: boolean;
	/** A failed older-page request; live state and timeline remain usable. */
	historyError: Error | null;
	/** Fetch and prepend the next older history page. Safe to call repeatedly. */
	loadOlder(): Promise<void>;
	actions: AcpSessionActions;
}

/** Three retries at 250ms, 500ms, and 1000ms keep restart recovery bounded. */
const MAX_RESYNC_RETRIES = 3;
const RESYNC_RETRY_BASE_DELAY_MS = 250;
export const INITIAL_LAUNCH_NOT_FOUND_RETRY_WINDOW_MS = 30_000;

type PendingEnvelopeBatch = {
	epoch: number;
	envelopes: SessionUpdateEnvelope[];
	cancel: () => void;
};

function mergeEnvelopesInSequence(
	...groups: readonly SessionUpdateEnvelope[][]
): SessionUpdateEnvelope[] {
	const bySeq = new Map<number, SessionUpdateEnvelope>();
	for (const envelope of groups.flat()) {
		// A page boundary can overlap with a live catch-up frame. Prefer the
		// already-rendered envelope so an older read cannot replace newer data.
		if (!bySeq.has(envelope.seq)) bySeq.set(envelope.seq, envelope);
	}
	return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

function isNotFoundError(cause: unknown): boolean {
	if (!(cause instanceof Error)) return false;
	const message = cause.message.toLowerCase();
	return (
		message.includes("not found") || message.includes("unknown acp session")
	);
}

export function shouldRetryInitialLaunchNotFound({
	initiallyLaunching,
	cause,
	elapsedMs,
}: {
	initiallyLaunching: boolean;
	cause: unknown;
	elapsedMs: number;
}): boolean {
	return (
		initiallyLaunching &&
		isNotFoundError(cause) &&
		elapsedMs < INITIAL_LAUNCH_NOT_FOUND_RETRY_WINDOW_MS
	);
}

/**
 * Message pages contain historical update frames, while state is a current
 * snapshot. Re-applying the snapshot after every page refold prevents an old
 * available_commands_update from replacing the active command catalog.
 */
export function overlayAuthoritativeState(
	timeline: FoldedTimeline,
	state: SessionScopedState | null,
): FoldedTimeline {
	if (state === null) return timeline;
	return {
		...timeline,
		// The fetched/live state is a full snapshot. Keep every control-plane
		// field in sync with it: adapters may return refreshed mode/config
		// catalogs in set_* responses without a matching incremental update.
		meta: {
			...timeline.meta,
			currentMode: state.currentMode,
			configOptions: state.configOptions,
			availableCommands: state.availableCommands,
		},
		state,
	};
}

export async function fetchCompleteMessageHistory(
	api: Pick<AcpSessionsApi, "getMessages">,
	sessionId: string,
	pageSize = 200,
): Promise<SessionUpdateEnvelope[]> {
	let cursor: string | undefined;
	const seenCursors = new Set<string>();
	let items: SessionUpdateEnvelope[] = [];

	do {
		const page = await api.getMessages({ sessionId, cursor, limit: pageSize });
		items = [...page.items, ...items];
		if (page.nextCursor === null) break;
		if (seenCursors.has(page.nextCursor)) {
			throw new Error(
				`getMessages returned a repeated cursor: ${page.nextCursor}`,
			);
		}
		seenCursors.add(page.nextCursor);
		cursor = page.nextCursor;
	} while (cursor !== undefined);

	return items;
}

/**
 * Attach to a host-service ACP session: seed from get + getMessages, fold the
 * WS stream on top, and resync automatically when the server signals reset.
 * All folding/gap/dedup logic lives in the pure `fold` and `client` modules —
 * this hook only orchestrates them.
 */
export function useAcpSession(
	options: UseAcpSessionOptions,
): UseAcpSessionResult {
	const { sessionId, pageSize = 200, connectionKey, enabled = true } = options;
	const initiallyLaunchingRef = useRef(options.initiallyLaunching ?? false);
	initiallyLaunchingRef.current = options.initiallyLaunching ?? false;

	// Latest transport without making it an effect dependency: callers often
	// build `api`/`streamUrl`/`createWebSocket` inline, and identity churn
	// must not tear down the socket.
	const apiRef = useRef(options.api);
	apiRef.current = options.api;
	const streamUrlRef = useRef(options.streamUrl);
	streamUrlRef.current = options.streamUrl;
	const createWebSocketRef = useRef(options.createWebSocket);
	createWebSocketRef.current = options.createWebSocket;
	const enabledRef = useRef(enabled);
	enabledRef.current = enabled;

	const [fetchedState, setFetchedState] = useState<SessionScopedState | null>(
		null,
	);
	const [timeline, setTimeline] = useState<FoldedTimeline>(emptyTimeline);
	const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting");
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const [hasOlder, setHasOlder] = useState(false);
	const [isLoadingOlder, setIsLoadingOlder] = useState(false);
	const [historyError, setHistoryError] = useState<Error | null>(null);
	const [availability, setAvailability] = useState<
		"live" | "retrying" | "unavailable"
	>("live");

	// Fold target between renders; epoch guards resync races (a stale resync
	// or a stale subscription's callbacks must not clobber a newer one).
	const timelineRef = useRef<FoldedTimeline>(timeline);
	const authoritativeStateRef = useRef<SessionScopedState | null>(null);
	// Every historical and live envelope folded so far, in sequence order.
	const envelopesRef = useRef<SessionUpdateEnvelope[]>([]);
	const epochRef = useRef(0);
	const subscriptionRef = useRef<SessionSubscription | null>(null);
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingEnvelopeBatchRef = useRef<PendingEnvelopeBatch | null>(null);
	const olderCursorRef = useRef<string | null>(null);
	const seenOlderCursorsRef = useRef(new Set<string>());
	const olderLoadPromiseRef = useRef<Promise<void> | null>(null);
	const launchStartedAtRef = useRef<number | null>(
		options.initiallyLaunching ? Date.now() : null,
	);

	const clearRetryTimer = useCallback(() => {
		if (retryTimerRef.current !== null) {
			clearTimeout(retryTimerRef.current);
			retryTimerRef.current = null;
		}
	}, []);

	const cancelPendingEnvelopeBatch = useCallback(() => {
		pendingEnvelopeBatchRef.current?.cancel();
		pendingEnvelopeBatchRef.current = null;
	}, []);

	const enqueueLiveEnvelope = useCallback(
		(envelope: SessionUpdateEnvelope, epoch: number) => {
			if (!enabledRef.current || epoch !== epochRef.current) return;
			const currentBatch = pendingEnvelopeBatchRef.current;
			if (currentBatch?.epoch === epoch) {
				currentBatch.envelopes.push(envelope);
				return;
			}
			cancelPendingEnvelopeBatch();

			let cancelled = false;
			const batch: PendingEnvelopeBatch = {
				epoch,
				envelopes: [envelope],
				cancel: () => {
					cancelled = true;
				},
			};
			const flush = () => {
				if (
					cancelled ||
					pendingEnvelopeBatchRef.current !== batch ||
					!enabledRef.current ||
					epoch !== epochRef.current
				)
					return;
				pendingEnvelopeBatchRef.current = null;
				let nextTimeline = timelineRef.current;
				for (const pendingEnvelope of batch.envelopes) {
					if (pendingEnvelope.frame.kind === "state") {
						authoritativeStateRef.current = pendingEnvelope.frame.state;
					} else if (
						pendingEnvelope.frame.kind === "update" &&
						pendingEnvelope.frame.update.sessionUpdate ===
							"available_commands_update" &&
						authoritativeStateRef.current !== null
					) {
						authoritativeStateRef.current = {
							...authoritativeStateRef.current,
							availableCommands: pendingEnvelope.frame.update.availableCommands,
						};
					}
					if (pendingEnvelope.frame.kind === "state") {
						envelopesRef.current = envelopesRef.current.filter(
							(buffered) => buffered.frame.kind !== "state",
						);
					}
					envelopesRef.current.push(pendingEnvelope);
					nextTimeline = overlayAuthoritativeState(
						foldEnvelope(nextTimeline, pendingEnvelope),
						authoritativeStateRef.current,
					);
				}
				timelineRef.current = nextTimeline;
				setTimeline(nextTimeline);
			};
			if (
				typeof requestAnimationFrame === "function" &&
				typeof cancelAnimationFrame === "function"
			) {
				const frame = requestAnimationFrame(flush);
				batch.cancel = () => {
					cancelled = true;
					cancelAnimationFrame(frame);
				};
			} else {
				const timeout = setTimeout(flush, 0);
				batch.cancel = () => {
					cancelled = true;
					clearTimeout(timeout);
				};
			}
			pendingEnvelopeBatchRef.current = batch;
		},
		[cancelPendingEnvelopeBatch],
	);

	const resync = useCallback(
		async function resync(retryAttempt = 0): Promise<void> {
			if (!enabledRef.current) return;
			const epoch = ++epochRef.current;
			if (retryAttempt === 0) clearRetryTimer();
			cancelPendingEnvelopeBatch();
			subscriptionRef.current?.close();
			subscriptionRef.current = null;
			olderCursorRef.current = null;
			seenOlderCursorsRef.current = new Set();
			olderLoadPromiseRef.current = null;
			setIsLoading(true);
			setHasOlder(false);
			setIsLoadingOlder(false);
			setHistoryError(null);
			try {
				const api = apiRef.current;
				const state = await api.get({ sessionId });
				if (!enabledRef.current || epoch !== epochRef.current) return;
				// Publish passive `offline` state before the live history read tries to
				// resurrect it. If session/load fails, the UI can explain that this is a
				// resumable registry row (and keep its composer disabled) alongside the
				// actual load error instead of looking like a brand-new empty thread.
				setFetchedState(state);
				authoritativeStateRef.current = state;
				const page = await api.getMessages({
					sessionId,
					limit: pageSize,
				});
				if (!enabledRef.current || epoch !== epochRef.current) return;

				envelopesRef.current = mergeEnvelopesInSequence(page.items);
				olderCursorRef.current = page.nextCursor;
				seenOlderCursorsRef.current = new Set();
				olderLoadPromiseRef.current = null;
				setHasOlder(page.nextCursor !== null);
				setHistoryError(null);
				// Historical pages can carry a stale available_commands_update. The
				// just-fetched state snapshot is current and must win. Seed it before
				// folding too: some adapters replay message snapshots without journaling
				// a state frame, and their harness identity determines chunk semantics.
				const seeded = overlayAuthoritativeState(
					foldEnvelopes(
						overlayAuthoritativeState(emptyTimeline(), state),
						envelopesRef.current,
					),
					state,
				);
				timelineRef.current = seeded;
				setTimeline(seeded);
				setIsLoading(false);
				setError(null);
				setAvailability("live");

				// Empty journal page but a non-zero server cursor (e.g. evicted
				// journal): subscribe from the server's seq to avoid a reset loop.
				const since = Math.max(seeded.lastSeq, state.lastSeq);
				subscriptionRef.current = subscribeToSession({
					streamUrl: () => {
						const current = streamUrlRef.current;
						return typeof current === "function" ? current() : current;
					},
					since,
					epoch: state.epoch,
					createWebSocket: createWebSocketRef.current,
					onEnvelope: (envelope) => {
						enqueueLiveEnvelope(envelope, epoch);
					},
					onStatus: (status) => {
						if (!enabledRef.current || epoch !== epochRef.current) return;
						setStreamStatus(status);
					},
					onReset: () => {
						if (!enabledRef.current || epoch !== epochRef.current) return;
						void resync();
					},
				});
			} catch (cause) {
				if (!enabledRef.current || epoch !== epochRef.current) return;
				setIsLoading(false);
				setError(cause instanceof Error ? cause : new Error(String(cause)));
				const retryInitialLaunchNotFound = shouldRetryInitialLaunchNotFound({
					initiallyLaunching: initiallyLaunchingRef.current,
					cause,
					elapsedMs:
						launchStartedAtRef.current === null
							? Number.POSITIVE_INFINITY
							: Date.now() - launchStartedAtRef.current,
				});
				if (retryAttempt >= MAX_RESYNC_RETRIES && !retryInitialLaunchNotFound) {
					setAvailability("unavailable");
					return;
				}
				setAvailability("retrying");
				const delay = retryInitialLaunchNotFound
					? 1_000
					: RESYNC_RETRY_BASE_DELAY_MS * 2 ** retryAttempt;
				retryTimerRef.current = setTimeout(() => {
					retryTimerRef.current = null;
					if (!enabledRef.current || epoch !== epochRef.current) return;
					void resync(retryAttempt + 1);
				}, delay);
			}
		},
		[
			sessionId,
			pageSize,
			clearRetryTimer,
			cancelPendingEnvelopeBatch,
			enqueueLiveEnvelope,
		],
	);

	const loadOlder = useCallback(async (): Promise<void> => {
		if (olderLoadPromiseRef.current !== null) {
			return olderLoadPromiseRef.current;
		}
		const cursor = olderCursorRef.current;
		if (!enabledRef.current || cursor === null) return;
		if (seenOlderCursorsRef.current.has(cursor)) {
			const repeatedCursorError = new Error(
				`getMessages returned a repeated cursor: ${cursor}`,
			);
			olderCursorRef.current = null;
			setHasOlder(false);
			setHistoryError(repeatedCursorError);
			return;
		}

		const epoch = epochRef.current;
		seenOlderCursorsRef.current.add(cursor);
		setIsLoadingOlder(true);
		setHistoryError(null);
		let request: Promise<void> | undefined;
		request = (async () => {
			try {
				const page = await apiRef.current.getMessages({
					sessionId,
					cursor,
					limit: pageSize,
				});
				if (!enabledRef.current || epoch !== epochRef.current) return;

				if (
					page.nextCursor !== null &&
					seenOlderCursorsRef.current.has(page.nextCursor)
				) {
					olderCursorRef.current = null;
					setHasOlder(false);
					setHistoryError(
						new Error(
							`getMessages returned a repeated cursor: ${page.nextCursor}`,
						),
					);
					return;
				}

				envelopesRef.current = mergeEnvelopesInSequence(
					page.items,
					envelopesRef.current,
				);
				const nextTimeline = overlayAuthoritativeState(
					foldEnvelopes(
						overlayAuthoritativeState(
							emptyTimeline(),
							authoritativeStateRef.current,
						),
						envelopesRef.current,
					),
					authoritativeStateRef.current,
				);
				timelineRef.current = nextTimeline;
				setTimeline(nextTimeline);
				olderCursorRef.current = page.nextCursor;
				setHasOlder(page.nextCursor !== null);
				setHistoryError(null);
			} catch (cause) {
				if (!enabledRef.current || epoch !== epochRef.current) return;
				// The request did not yield a page, so this cursor is safe to retry.
				seenOlderCursorsRef.current.delete(cursor);
				setHistoryError(
					cause instanceof Error ? cause : new Error(String(cause)),
				);
			} finally {
				if (enabledRef.current && epoch === epochRef.current) {
					setIsLoadingOlder(false);
				}
				if (request !== undefined && olderLoadPromiseRef.current === request) {
					olderLoadPromiseRef.current = null;
				}
			}
		})();
		if (request === undefined) return;
		olderLoadPromiseRef.current = request;
		return request;
	}, [pageSize, sessionId]);

	// The session currently reflected by the rendered state/timeline. When the
	// route swaps sessionIds in place, the old session's thread (and its still-
	// answerable permissions) must not stay visible while the new one loads —
	// clear before resyncing. Same-session resyncs (refresh, reset) keep the
	// existing data rendered during the round trip.
	const renderedSessionIdRef = useRef(sessionId);
	const renderedConnectionKeyRef = useRef(connectionKey);

	useEffect(() => {
		if (renderedSessionIdRef.current !== sessionId) {
			renderedSessionIdRef.current = sessionId;
			renderedConnectionKeyRef.current = connectionKey;
			envelopesRef.current = [];
			timelineRef.current = emptyTimeline();
			authoritativeStateRef.current = null;
			olderCursorRef.current = null;
			seenOlderCursorsRef.current = new Set();
			olderLoadPromiseRef.current = null;
			clearRetryTimer();
			setFetchedState(null);
			setTimeline(timelineRef.current);
			setStreamStatus("connecting");
			setAvailability("live");
			setHasOlder(false);
			setIsLoadingOlder(false);
			setHistoryError(null);
			launchStartedAtRef.current = initiallyLaunchingRef.current
				? Date.now()
				: null;
		} else if (renderedConnectionKeyRef.current !== connectionKey) {
			// Keep the durable timeline on screen, but give the replacement host a
			// fresh retry budget and a fresh subscription. The api/socket functions
			// are deliberately not dependencies: callers may recreate them on every
			// render, while a transport change is an explicit lifecycle event.
			renderedConnectionKeyRef.current = connectionKey;
			clearRetryTimer();
			setStreamStatus("connecting");
			setAvailability("live");
			setError(null);
		}
		if (enabled) void resync();
		return () => {
			epochRef.current += 1;
			clearRetryTimer();
			cancelPendingEnvelopeBatch();
			subscriptionRef.current?.close();
			subscriptionRef.current = null;
		};
	}, [
		sessionId,
		resync,
		clearRetryTimer,
		cancelPendingEnvelopeBatch,
		connectionKey,
		enabled,
	]);

	const actions = useMemo<AcpSessionActions>(
		() => ({
			prompt: (blocks) => apiRef.current.prompt({ sessionId, prompt: blocks }),
			cancel: () => apiRef.current.cancel({ sessionId }),
			respondToPermission: (requestId, outcome) =>
				apiRef.current.respondToPermission({ sessionId, requestId, outcome }),
			setMode: (modeId) => apiRef.current.setMode({ sessionId, modeId }),
			setConfigOption: (configId, value) =>
				apiRef.current.setConfigOption({ sessionId, configId, value }),
			refresh: () => resync(),
			enqueue: (blocks) =>
				apiRef.current.enqueuePrompt({ sessionId, prompt: blocks }),
			sendNow: (blocks) =>
				apiRef.current.sendNow({ sessionId, prompt: blocks }),
			removeQueued: (queueId) =>
				apiRef.current.removeQueuedPrompt({ sessionId, queueId }),
			reorderQueue: (orderedIds) =>
				apiRef.current.reorderQueue({ sessionId, orderedIds }),
			editQueued: (queueId, blocks) =>
				apiRef.current.editQueuedPrompt({
					sessionId,
					queueId,
					prompt: blocks,
				}),
			clearQueue: () => apiRef.current.clearQueue({ sessionId }),
		}),
		[sessionId, resync],
	);

	return {
		// State frames folded from the stream supersede the initial fetch.
		state: timeline.state ?? fetchedState,
		timeline,
		streamStatus,
		isLoading,
		availability,
		error,
		hasOlder,
		isLoadingOlder,
		historyError,
		loadOlder,
		actions,
	};
}
