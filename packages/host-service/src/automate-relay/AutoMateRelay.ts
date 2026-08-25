import type { RelayEnvelope } from "@superset/session-protocol";

export interface RelayTaskClient {
	request(input: unknown): Promise<unknown>;
	close?(): void;
}
export interface RelayDependencies {
	client: RelayTaskClient;
	fetch: (
		input: string | URL | Request,
		init?: RequestInit,
	) => Promise<Response>;
	baseUrl: string;
	createWebSocket?: RelaySocketFactory;
	sleep?: (ms: number) => Promise<void>;
}
type RelayMessage = { seq: number; messageId: string; body: RelayEnvelope };
type OutboundEnvelope = {
	body: RelayEnvelope;
	retryUntilStopped: boolean;
	resolve: () => void;
	reject: (error: Error) => void;
};
// Host and phone each keep one mailbox direction alive. At 500ms, idle polling
// stays at ~4 requests/sec combined, leaving headroom under task QPS=10 for
// pushes and acknowledgements while keeping streaming responsive.
export const EMPTY_RELAY_PULL_DELAY_MS = 500;
const MAX_CONCURRENT_TASK_REQUESTS = 4;

/** Host-side mailbox worker. The relay is only a carrier; phone credentials survive unchanged. */
export class AutoMateRelay {
	private stopped = false;
	private readonly hostInstanceId = crypto.randomUUID();
	private readonly seen = new Set<string>();
	private readonly streams = new Map<string, RelaySocket>();
	private readonly streamFrameTails = new Map<string, Promise<void>>();
	private readonly outboundQueue: OutboundEnvelope[] = [];
	private outboundPumping = false;
	private readonly createWebSocket: RelaySocketFactory;
	constructor(
		readonly mailboxId: string,
		private readonly deps: RelayDependencies,
	) {
		this.createWebSocket =
			deps.createWebSocket ??
			((url) => new WebSocket(url) as unknown as RelaySocket);
	}
	start(): void {
		// A process crash can strand phone-side polling sockets without a final
		// stream.close. Send a durable control envelope for every new Host
		// incarnation so the phone can close those stale channels and let its
		// normal stream subscriber reconnect.
		void this.enqueueOutbound(
			{ kind: "host.reset", hostInstanceId: this.hostInstanceId },
			true,
		).catch((error) =>
			console.warn("[automate-relay] host reset push failed", error),
		);
		void this.run();
	}
	stop(): void {
		this.stopped = true;
		const stopped = new Error("AutoMate relay stopped");
		for (const pending of this.outboundQueue) pending.reject(stopped);
		this.outboundQueue.length = 0;
		for (const socket of this.streams.values()) socket.close();
		this.streams.clear();
		this.streamFrameTails.clear();
		this.deps.client.close?.();
	}
	private async invoke(input: unknown): Promise<unknown> {
		const result = await this.deps.client.request(input);
		if (
			typeof result === "object" &&
			result !== null &&
			"ok" in result &&
			(result as { ok?: unknown }).ok === false
		) {
			throw new Error("AutoMate relay operation failed");
		}
		return result;
	}
	private async ack(seq: number): Promise<void> {
		await this.invoke({
			op: "ack",
			mailboxId: this.mailboxId,
			direction: "c2s",
			seq,
		});
	}
	private async push(body: RelayEnvelope): Promise<void> {
		return this.enqueueOutbound(body, false);
	}
	private enqueueOutbound(
		body: RelayEnvelope,
		retryUntilStopped: boolean,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			if (body.kind === "stream.frame") {
				const last = this.outboundQueue.at(-1);
				if (last?.body.kind === "stream.frames" && last.retryUntilStopped) {
					last.body.frames.push({
						channelId: body.channelId,
						body: body.body,
					});
					const previousResolve = last.resolve;
					const previousReject = last.reject;
					last.resolve = () => {
						previousResolve();
						resolve();
					};
					last.reject = (error) => {
						previousReject(error);
						reject(error);
					};
				} else {
					this.outboundQueue.push({
						body: {
							kind: "stream.frames",
							frames: [{ channelId: body.channelId, body: body.body }],
						},
						retryUntilStopped,
						resolve,
						reject,
					});
				}
			} else {
				this.outboundQueue.push({ body, retryUntilStopped, resolve, reject });
			}
			void this.drainOutbound();
		});
	}
	private async drainOutbound(): Promise<void> {
		if (this.outboundPumping) return;
		this.outboundPumping = true;
		try {
			while (!this.stopped && this.outboundQueue.length > 0) {
				const next = this.outboundQueue.shift();
				if (!next) continue;
				try {
					if (next.retryUntilStopped) await this.pushStreamWithRetry(next.body);
					else await this.pushEnvelope(next.body);
					next.resolve();
				} catch (error) {
					next.reject(asError(error));
				}
			}
		} finally {
			this.outboundPumping = false;
			if (!this.stopped && this.outboundQueue.length > 0)
				void this.drainOutbound();
		}
	}
	private async pushEnvelope(body: RelayEnvelope): Promise<void> {
		await this.invoke({
			op: "push",
			mailboxId: this.mailboxId,
			direction: "s2c",
			messageId: crypto.randomUUID(),
			body,
		});
	}
	private async run(): Promise<void> {
		while (!this.stopped) {
			try {
				const result = (await this.invoke({
					op: "pull",
					mailboxId: this.mailboxId,
					direction: "c2s",
				})) as { message?: RelayMessage };
				const message = result?.message;
				if (!message) {
					await (this.deps.sleep?.(EMPTY_RELAY_PULL_DELAY_MS) ??
						new Promise((r) => setTimeout(r, EMPTY_RELAY_PULL_DELAY_MS)));
					continue;
				}
				if (this.seen.has(message.messageId)) {
					await this.ack(message.seq);
					this.seen.delete(message.messageId);
					continue;
				}
				if (message.body.kind === "http.request")
					await this.forward(message.body);
				else if (message.body.kind === "stream.open")
					await this.openStream(message.body);
				else if (message.body.kind === "stream.close")
					this.closeStream(
						message.body.channelId,
						message.body.code,
						message.body.reason,
					);
				else if (message.body.kind === "stream.frame")
					await this.forwardStreamFrame(message.body);
				else {
					await this.ack(message.seq);
					continue;
				}
				// Only dedupe after forwarding/pushing its response completed. If that
				// work throws, leaving the message unacked permits a safe retry.
				this.seen.add(message.messageId);
				await this.ack(message.seq);
				this.seen.delete(message.messageId);
			} catch (error) {
				console.warn("[automate-relay] mailbox poll failed", error);
				await (this.deps.sleep?.(1_000) ??
					new Promise((r) => setTimeout(r, 1_000)));
			}
		}
	}
	private async forward(
		request: Extract<RelayEnvelope, { kind: "http.request" }>,
	): Promise<void> {
		if (!isAllowedPath(request.path)) {
			await this.push({
				kind: "http.response",
				requestId: request.requestId,
				status: 403,
				headers: { "content-type": "text/plain" },
				body: toBase64("Forbidden relay path"),
			});
			return;
		}
		if (request.method !== "GET" && request.method !== "POST") {
			await this.push({
				kind: "http.response",
				requestId: request.requestId,
				status: 405,
				headers: {},
				body: toBase64("Method Not Allowed"),
			});
			return;
		}
		const response = await this.deps.fetch(
			new URL(request.path, this.deps.baseUrl),
			{
				method: request.method,
				headers: safeHeaders(request.headers),
				body: request.body ? fromBase64(request.body) : undefined,
			},
		);
		await this.push({
			kind: "http.response",
			requestId: request.requestId,
			status: response.status,
			headers: Object.fromEntries(response.headers.entries()),
			body: toBase64(new Uint8Array(await response.arrayBuffer())),
		});
	}
	private async openStream(
		request: Extract<RelayEnvelope, { kind: "stream.open" }>,
	): Promise<void> {
		if (!isAllowedPath(request.path)) {
			await this.push({
				kind: "stream.close",
				channelId: request.channelId,
				code: 1008,
				reason: "Forbidden relay path",
			});
			return;
		}
		const target = new URL(request.path, this.deps.baseUrl);
		target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
		const socket = this.createWebSocket(target.toString());
		socket.binaryType = "arraybuffer";
		this.streams.set(request.channelId, socket);
		socket.onmessage = (event) => {
			this.enqueueEncodedStreamEvent(request.channelId, async () => ({
				kind: "stream.frame",
				channelId: request.channelId,
				body: await encodeRelayFrame(event.data),
			}));
		};
		socket.onclose = (event) => {
			this.streams.delete(request.channelId);
			this.enqueueEncodedStreamEvent(request.channelId, async () => ({
				kind: "stream.close",
				channelId: request.channelId,
				code: event?.code,
				reason: event?.reason,
			}));
		};
		socket.onerror = () => {
			this.closeStream(request.channelId, 1011, "Host stream failed");
		};
	}
	private closeStream(channelId: string, code?: number, reason?: string): void {
		const socket = this.streams.get(channelId);
		this.streams.delete(channelId);
		socket?.close(code, reason);
	}
	private enqueueEncodedStreamEvent(
		channelId: string,
		encode: () => Promise<RelayEnvelope>,
	): void {
		const previous = this.streamFrameTails.get(channelId) ?? Promise.resolve();
		const current = previous
			.then(encode)
			.then((body) => {
				this.enqueueStreamPush(body);
			})
			.catch((error) => {
				console.warn("[automate-relay] stream frame encoding failed", error);
			});
		this.streamFrameTails.set(channelId, current);
		void current.then(() => {
			if (this.streamFrameTails.get(channelId) === current) {
				this.streamFrameTails.delete(channelId);
			}
		});
	}
	private async forwardStreamFrame(
		frame: Extract<RelayEnvelope, { kind: "stream.frame" }>,
	): Promise<void> {
		const socket = this.streams.get(frame.channelId);
		if (socket) {
			socket.send(
				frame.body.type === "text"
					? frame.body.data
					: Buffer.from(frame.body.data, "base64"),
			);
			return;
		}

		// The ordered mailbox can still contain a frame after a stream has closed.
		// Tell the phone to discard its stale channel before acknowledging it so the
		// message cannot block subsequent mailbox traffic.
		await this.push({
			kind: "stream.close",
			channelId: frame.channelId,
			code: 1002,
			reason: "Unknown relay stream",
		});
	}
	private enqueueStreamPush(body: RelayEnvelope): void {
		void this.enqueueOutbound(body, true).catch((error) =>
			console.warn("[automate-relay] stream push failed", error),
		);
	}
	private async pushStreamWithRetry(body: RelayEnvelope): Promise<void> {
		const messageId = crypto.randomUUID();
		while (!this.stopped) {
			try {
				await this.pushEnvelopeWithMessageId(body, messageId);
				return;
			} catch (error) {
				console.warn("[automate-relay] retrying stream push", error);
				await (this.deps.sleep?.(1_000) ??
					new Promise((resolve) => setTimeout(resolve, 1_000)));
			}
		}
	}
	private async pushEnvelopeWithMessageId(
		body: RelayEnvelope,
		messageId: string,
	): Promise<void> {
		await this.invoke({
			op: "push",
			mailboxId: this.mailboxId,
			direction: "s2c",
			messageId,
			body,
		});
	}
}

export interface RelaySocket {
	readyState: number;
	binaryType?: "blob" | "arraybuffer" | "nodebuffer";
	onopen: (() => void) | null;
	onmessage: ((event: { data: unknown }) => void) | null;
	onclose: ((event?: { code?: number; reason?: string }) => void) | null;
	onerror: (() => void) | null;
	send(data: string | ArrayBuffer | Uint8Array): void;
	close(code?: number, reason?: string): void;
}
type RelaySocketFactory = (url: string) => RelaySocket;
type QueuedOperation = {
	input: unknown;
	requestId: string;
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
};

/** AutoMate task 16739 websocket adapter: hello -> msg -> done. */
export class AutoMateRelayTaskClient implements RelayTaskClient {
	private socket: RelaySocket | null = null;
	private opening: Promise<RelaySocket> | null = null;
	private queue: QueuedOperation[] = [];
	private readonly active = new Map<string, QueuedOperation>();
	private sending = false;
	private closed = false;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	constructor(
		private readonly url: string,
		private readonly createSocket: RelaySocketFactory = (url) =>
			new WebSocket(url) as unknown as RelaySocket,
	) {}
	request(input: unknown): Promise<unknown> {
		if (this.closed)
			return Promise.reject(new Error("AutoMate relay client closed"));
		return new Promise((resolve, reject) => {
			this.queue.push({
				input,
				requestId: crypto.randomUUID(),
				resolve,
				reject,
			});
			void this.flush();
		});
	}
	close(): void {
		this.closed = true;
		this.rejectAll(new Error("AutoMate relay client closed"));
		this.socket?.close();
		this.clearHeartbeat();
		this.socket = null;
		this.opening = null;
	}
	private async flush(): Promise<void> {
		if (this.sending || !this.queue.length || this.closed) return;
		this.sending = true;
		try {
			const socket = await this.connect();
			while (
				this.active.size < MAX_CONCURRENT_TASK_REQUESTS &&
				this.queue.length > 0
			) {
				const current = this.queue.shift();
				if (!current) break;
				this.active.set(current.requestId, current);
				socket.send(
					JSON.stringify({
						type: "msg",
						request_id: current.requestId,
						payload: current.input,
					}),
				);
			}
		} catch (error) {
			this.rejectAll(asError(error));
		} finally {
			this.sending = false;
			void this.flush();
		}
	}
	private async connect(): Promise<RelaySocket> {
		if (this.socket) return this.socket;
		if (this.opening) return await this.opening;
		this.opening = new Promise<RelaySocket>((resolve, reject) => {
			const socket = this.createSocket(this.url);
			let settled = false;
			const failOpening = (error: Error) => {
				if (!settled) {
					settled = true;
					this.opening = null;
					reject(error);
				}
			};
			const protocolError = (type: string, payload: unknown): Error => {
				const message =
					typeof payload === "object" &&
					payload !== null &&
					"message" in payload &&
					typeof (payload as { message?: unknown }).message === "string"
						? `: ${(payload as { message: string }).message}`
						: "";
				return new Error(`AutoMate relay ${type}${message}`);
			};
			const timeout = setTimeout(() => {
				socket.close();
				failOpening(new Error("AutoMate relay hello timed out"));
			}, 20_000);
			socket.onmessage = (event) => {
				let message: {
					type?: unknown;
					request_id?: unknown;
					payload?: unknown;
				};
				try {
					message = JSON.parse(String(event.data));
				} catch {
					return;
				}
				if (message.type === "ping") {
					socket.send(JSON.stringify({ type: "pong" }));
					return;
				}
				if (message.type === "pong") return;
				if (message.type === "hello") {
					if (!settled) {
						settled = true;
						clearTimeout(timeout);
						this.socket = socket;
						this.opening = null;
						const interval = heartbeatInterval(message.payload);
						if (interval) this.startHeartbeat(socket, interval);
						resolve(socket);
					}
					return;
				}
				if (message.type === "done" && typeof message.request_id === "string") {
					const current = this.active.get(message.request_id);
					if (!current) return;
					this.active.delete(message.request_id);
					const payload = message.payload as { result?: unknown } | undefined;
					current.resolve(payload?.result);
					void this.flush();
					return;
				}
				if (message.type === "auth_error" || message.type === "error") {
					const error = protocolError(message.type, message.payload);
					if (!settled) {
						clearTimeout(timeout);
						failOpening(error);
						this.rejectAll(error);
						socket.close();
						return;
					}
					if (message.type === "auth_error") {
						this.rejectAll(error);
						socket.close();
						return;
					}
					if (typeof message.request_id !== "string") {
						this.rejectAll(error);
						return;
					}
					const current = this.active.get(message.request_id);
					if (current && message.request_id === current.requestId) {
						this.active.delete(current.requestId);
						current.reject(error);
						void this.flush();
					}
				}
			};
			socket.onclose = () => {
				clearTimeout(timeout);
				this.clearHeartbeat();
				this.socket = null;
				failOpening(
					new Error("AutoMate relay socket closed while waiting for hello"),
				);
				this.rejectAll(new Error("AutoMate relay socket closed"));
			};
			socket.onerror = () => {
				this.clearHeartbeat();
				failOpening(new Error("AutoMate relay socket failed to connect"));
				socket.close();
			};
		});
		return await this.opening;
	}
	private startHeartbeat(socket: RelaySocket, interval: number): void {
		this.clearHeartbeat();
		this.heartbeatTimer = setInterval(() => {
			if (this.socket === socket) socket.send(JSON.stringify({ type: "ping" }));
		}, interval);
	}
	private clearHeartbeat(): void {
		if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
		this.heartbeatTimer = null;
	}
	private rejectAll(error: Error): void {
		for (const current of this.active.values()) current.reject(error);
		this.active.clear();
		for (const pending of this.queue) pending.reject(error);
		this.queue = [];
	}
}
function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
function heartbeatInterval(payload: unknown): number | null {
	if (typeof payload !== "object" || payload === null) return null;
	const value = (payload as { heartbeat_interval_ms?: unknown })
		.heartbeat_interval_ms;
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: null;
}
export function isAllowedPath(path: string): boolean {
	try {
		const url = new URL(path, "http://relay.invalid");
		return (
			url.origin === "http://relay.invalid" &&
			(isAllowedTrpcPath(url.pathname) ||
				/^\/acp-sessions\/[^/]+\/stream$/.test(url.pathname) ||
				/^\/terminal\/[^/]+$/.test(url.pathname))
		);
	} catch {
		return false;
	}
}
async function encodeRelayFrame(
	value: unknown,
): Promise<{ type: "text"; data: string } | { type: "binary"; data: string }> {
	if (typeof value === "string") return { type: "text", data: value };
	if (value instanceof ArrayBuffer)
		return { type: "binary", data: Buffer.from(value).toString("base64") };
	if (ArrayBuffer.isView(value)) {
		return {
			type: "binary",
			data: Buffer.from(
				value.buffer,
				value.byteOffset,
				value.byteLength,
			).toString("base64"),
		};
	}
	if (typeof Blob !== "undefined" && value instanceof Blob) {
		return {
			type: "binary",
			data: Buffer.from(await value.arrayBuffer()).toString("base64"),
		};
	}
	return { type: "text", data: String(value) };
}

const PHONE_RELAY_TRPC_PATHS = new Set([
	"health.check",
	"host.info",
	"phone.pairing.redeem",
	"phone.me",
	"terminal.listSessions",
	"terminalAgents.listByWorkspace",
	"terminalAgents.getOrCreate",
	"workspaceCatalog.snapshot",
]);

function isAllowedTrpcPath(pathname: string): boolean {
	if (!pathname.startsWith("/trpc/")) return false;
	const procedure = decodeURIComponent(pathname.slice("/trpc/".length));
	return (
		PHONE_RELAY_TRPC_PATHS.has(procedure) ||
		procedure.startsWith("acpSessions.")
	);
}
function toBase64(value: string | Uint8Array): string {
	const bytes =
		typeof value === "string" ? new TextEncoder().encode(value) : value;
	return Buffer.from(bytes).toString("base64");
}
function fromBase64(value: string): ArrayBuffer {
	return Uint8Array.from(Buffer.from(value, "base64")).buffer;
}
function safeHeaders(headers: Record<string, string>): Headers {
	const result = new Headers();
	const blocked = new Set([
		"host",
		"content-length",
		"connection",
		"upgrade",
		"keep-alive",
		"transfer-encoding",
	]);
	for (const [name, value] of Object.entries(headers))
		if (!blocked.has(name.toLowerCase())) result.set(name, value);
	return result;
}
