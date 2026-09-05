/**
 * Live subscription to a session's journal over WebSocket.
 *
 * The route is server-to-client only: one JSON `SessionUpdateEnvelope` per
 * message. With `since`, the retained journal tail replays before going live,
 * so a caller that already read state can resume without gaps.
 *
 * Bun provides a global WebSocket, so this needs no dependency.
 */

import type { SessionUpdateEnvelope } from "@superset/session-protocol";
import { timeoutError } from "./exit-codes";
import { type HostConnection, sessionStreamUrl } from "./host-connection";

export interface SubscribeOptions {
	sessionId: string;
	/** Resume after this seq; omit to receive only new frames. */
	since?: number;
	/** Journal incarnation to pin; a mismatch yields a `reset` frame. */
	epoch?: string;
	/** Called for every envelope, in order. */
	onEnvelope: (envelope: SessionUpdateEnvelope) => void;
	/** Abort the subscription early. */
	signal?: AbortSignal;
	/** Fail if the socket does not open within this many milliseconds. */
	openTimeoutMs?: number;
}

/** Why a subscription ended. */
export type StreamEndReason =
	/** `onEnvelope` (or a caller-side condition) asked to stop. */
	| "completed"
	/** The server closed the socket normally. */
	| "closed"
	/** The cursor was unservable; caller must resync via get/getMessages. */
	| "reset"
	/** The caller aborted. */
	| "aborted";

export interface StreamResult {
	reason: StreamEndReason;
	/** Highest seq observed, for resuming a later subscription. */
	lastSeq: number;
	/** Present when the stream ended with a `reset` frame. */
	resetReason?: string;
}

const DEFAULT_OPEN_TIMEOUT_MS = 10_000;

/**
 * Sentinel an `onEnvelope` callback throws to end the stream cleanly, letting
 * a caller stop on a condition (turn finished) without racing socket close.
 */
export const STOP_STREAM = Symbol("stop-stream");

export function stopStream(): never {
	throw STOP_STREAM;
}

/**
 * Consume a session stream until the caller stops it, the server closes, or
 * the cursor resets. Resolves rather than rejects on normal termination so
 * callers branch on `reason` instead of catching.
 */
export function subscribeToSession(
	connection: HostConnection,
	options: SubscribeOptions,
): Promise<StreamResult> {
	const url = sessionStreamUrl(connection, options.sessionId, {
		since: options.since,
		epoch: options.epoch,
	});

	return new Promise<StreamResult>((resolve, reject) => {
		let lastSeq = options.since ?? 0;
		let settled = false;
		let opened = false;

		const socket = new WebSocket(url);

		const finish = (result: StreamResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(openTimer);
			options.signal?.removeEventListener("abort", onAbort);
			try {
				socket.close();
			} catch {
				// best-effort; the socket may already be closing
			}
			resolve(result);
		};

		const fail = (error: unknown) => {
			if (settled) return;
			settled = true;
			clearTimeout(openTimer);
			options.signal?.removeEventListener("abort", onAbort);
			try {
				socket.close();
			} catch {
				// best-effort
			}
			reject(error);
		};

		const openTimer = setTimeout(() => {
			if (opened) return;
			fail(
				timeoutError(
					"Timed out opening the session stream.",
					`Endpoint: ${connection.endpoint}`,
				),
			);
		}, options.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS);

		const onAbort = () => finish({ reason: "aborted", lastSeq });
		options.signal?.addEventListener("abort", onAbort, { once: true });

		if (options.signal?.aborted) {
			finish({ reason: "aborted", lastSeq });
			return;
		}

		socket.onopen = () => {
			opened = true;
			clearTimeout(openTimer);
		};

		socket.onmessage = (event: MessageEvent) => {
			if (settled) return;
			const raw = typeof event.data === "string" ? event.data : null;
			if (!raw) return;

			let envelope: SessionUpdateEnvelope;
			try {
				envelope = JSON.parse(raw) as SessionUpdateEnvelope;
			} catch {
				// A frame we cannot parse is not worth killing the stream over.
				return;
			}

			if (envelope.frame.kind === "reset") {
				finish({
					reason: "reset",
					lastSeq,
					resetReason: envelope.frame.reason,
				});
				return;
			}

			if (envelope.seq > lastSeq) lastSeq = envelope.seq;

			try {
				options.onEnvelope(envelope);
			} catch (error) {
				if (error === STOP_STREAM) {
					finish({ reason: "completed", lastSeq });
					return;
				}
				fail(error);
			}
		};

		socket.onclose = () => finish({ reason: "closed", lastSeq });

		socket.onerror = () => {
			// `onclose` follows and carries the outcome; only a failure to ever
			// open is worth surfacing as an error.
			if (!opened) {
				fail(
					new Error(
						`Failed to open the session stream at ${connection.endpoint}.`,
					),
				);
			}
		};
	});
}
