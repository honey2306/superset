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
	sleep?: (ms: number) => Promise<void>;
}
type RelayMessage = { messageId: string; body: RelayEnvelope };

/** Host-side mailbox worker. The relay is only a carrier; phone credentials survive unchanged. */
export class AutoMateRelay {
	private stopped = false;
	private readonly seen = new Set<string>();
	private readonly streams = new Map<string, WebSocket>();
	private streamPushTail = Promise.resolve();
	constructor(
		readonly mailboxId: string,
		private readonly deps: RelayDependencies,
	) {}
	start(): void {
		void this.run();
	}
	stop(): void {
		this.stopped = true;
		for (const socket of this.streams.values()) socket.close();
		this.streams.clear();
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
	private async ack(messageId: string): Promise<void> {
		await this.invoke({
			op: "ack",
			mailboxId: this.mailboxId,
			direction: "c2s",
			messageId,
		});
	}
	private async push(body: RelayEnvelope): Promise<void> {
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
					await (this.deps.sleep?.(250) ??
						new Promise((r) => setTimeout(r, 250)));
					continue;
				}
				if (this.seen.has(message.messageId)) {
					await this.ack(message.messageId);
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
					await this.ack(message.messageId);
					continue;
				}
				// Only dedupe after forwarding/pushing its response completed. If that
				// work throws, leaving the message unacked permits a safe retry.
				this.seen.add(message.messageId);
				await this.ack(message.messageId);
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
		if (request.method !== "POST") {
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
		const socket = new WebSocket(target.toString());
		this.streams.set(request.channelId, socket);
		socket.onmessage = (event) => {
			this.enqueueStreamPush({
				kind: "stream.frame",
				channelId: request.channelId,
				body: encodeRelayFrame(event.data),
			});
		};
		socket.onclose = (event) => {
			this.streams.delete(request.channelId);
			this.enqueueStreamPush({
				kind: "stream.close",
				channelId: request.channelId,
				code: event.code,
				reason: event.reason,
			});
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
		this.streamPushTail = this.streamPushTail
			.then(() => this.pushStreamWithRetry(body))
			.catch((error) =>
				console.warn("[automate-relay] stream push failed", error),
			);
	}
	private async pushStreamWithRetry(body: RelayEnvelope): Promise<void> {
		const messageId = crypto.randomUUID();
		while (!this.stopped) {
			try {
				await this.invoke({
					op: "push",
					mailboxId: this.mailboxId,
					direction: "s2c",
					messageId,
					body,
				});
				return;
			} catch (error) {
				console.warn("[automate-relay] retrying stream push", error);
				await (this.deps.sleep?.(1_000) ??
					new Promise((resolve) => setTimeout(resolve, 1_000)));
			}
		}
	}
}

interface RelaySocket {
	readyState: number;
	onopen: (() => void) | null;
	onmessage: ((event: { data: unknown }) => void) | null;
	onclose: (() => void) | null;
	onerror: (() => void) | null;
	send(data: string): void;
	close(): void;
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
	private current: QueuedOperation | null = null;
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
		if (this.current || this.sending || !this.queue.length || this.closed)
			return;
		const current = this.queue.shift();
		if (!current) return;
		this.sending = true;
		try {
			const socket = await this.connect();
			this.current = current;
			socket.send(
				JSON.stringify({
					type: "msg",
					request_id: current.requestId,
					payload: current.input,
				}),
			);
		} catch (error) {
			current.reject(asError(error));
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
					const current = this.current;
					if (!current || current.requestId !== message.request_id) return;
					this.current = null;
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
						socket.close();
						return;
					}
					const current = this.current;
					if (
						current &&
						(message.request_id === undefined ||
							message.request_id === current.requestId)
					) {
						this.current = null;
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
		this.current?.reject(error);
		this.current = null;
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
function encodeRelayFrame(
	value: unknown,
): { type: "text"; data: string } | { type: "binary"; data: string } {
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
	return { type: "text", data: String(value) };
}

const PHONE_RELAY_TRPC_PATHS = new Set([
	"health.check",
	"host.info",
	"phone.pairing.redeem",
	"phone.me",
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
