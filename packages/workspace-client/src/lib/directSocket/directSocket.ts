import { WebSocket as ReconnectingWebSocket } from "partysocket";
import { createOutageReporter } from "./outageReporter";

export interface DirectSocketOptions {
	/** Label attached to telemetry events so consumers are distinguishable. */
	name?: string;
	/** URL for this attempt, WITHOUT the auth token — the wrapper signs it. */
	buildUrl: () => string | Promise<string>;
	/** Fresh direct host token for every connection attempt. */
	getToken: () => string | null | Promise<string | null>;
	minReconnectionDelay?: number;
	maxReconnectionDelay?: number;
	maxRetries?: number;
	connectionTimeout?: number;
	/** Defaults to 0: send() is a no-op unless the socket is open. Opt into
	 * partysocket's buffer-and-replay only when stale sends are safe. */
	maxEnqueuedMessages?: number;
}

export type DirectSocket = ReconnectingWebSocket;

// Accepts http(s) host URLs and converts to ws(s), so consumers can pass
// their direct host URL straight through without scheme juggling.
function signUrl(url: string, token: string | null): string {
	const u = new URL(url);
	if (u.protocol === "http:") u.protocol = "ws:";
	if (u.protocol === "https:") u.protocol = "wss:";
	if (token) u.searchParams.set("token", token);
	return u.toString();
}

/**
 * Reconnecting WebSocket for direct host-service endpoints. partysocket
 * evaluates the async URL provider before every attempt, so each dial carries
 * a fresh token while preserving bounded buffering and outage telemetry.
 */
export function createDirectSocket(opts: DirectSocketOptions): DirectSocket {
	let socket: ReconnectingWebSocket | null = null;
	const reporter = createOutageReporter(opts.name ?? "direct-host");
	// retryCount is the 0-based ordinal of the current dial and only resets
	// after minUptime of stable connection. When reporting a failure the dial
	// counts itself, hence +1; at open time it already equals the failures
	// that preceded the successful dial.
	const failuresSoFar = () => (socket?.retryCount ?? 0) + 1;

	const provider = async (): Promise<string> => {
		const url = signUrl(await opts.buildUrl(), await opts.getToken());
		reporter.attempt(url);
		return url;
	};

	socket = new ReconnectingWebSocket(provider, [], {
		minReconnectionDelay: opts.minReconnectionDelay,
		maxReconnectionDelay: opts.maxReconnectionDelay,
		maxRetries: opts.maxRetries,
		connectionTimeout: opts.connectionTimeout,
		maxEnqueuedMessages: opts.maxEnqueuedMessages ?? 0,
	});

	socket.addEventListener("close", (event) => {
		// Only count real server closes. partysocket also dispatches synthetic
		// close events whose cloned code is not numeric.
		if (typeof event.code !== "number" || event.code === 1000) return;
		reporter.failed(failuresSoFar(), {
			code: event.code,
			reason: typeof event.reason === "string" ? event.reason : "",
		});
	});
	socket.addEventListener("error", () => reporter.failed(failuresSoFar()));
	socket.addEventListener("open", () =>
		reporter.opened(socket?.retryCount ?? 0),
	);

	return socket;
}
