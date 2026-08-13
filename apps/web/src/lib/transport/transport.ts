import type { RelayEnvelope } from "@superset/session-protocol";
import type { WebSocketLike } from "@superset/session-protocol/client";
import { getStoredRelayMailboxId } from "../auth-store";
import {
	getAutoMatePairingHashParams,
	getAutoMatePairingPathParams,
	getPairingCredentials,
} from "../automate-pairing";

export interface PhoneTransport {
	fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
	createWebSocket(url: string): WebSocketLike & {
		send(data: string): void;
		readyState?: number;
		binaryType?: BinaryType;
	};
}

export class DirectTransport implements PhoneTransport {
	fetch(input: RequestInfo | URL, init?: RequestInit) {
		return fetch(input, init);
	}
	createWebSocket(url: string): WebSocketLike & {
		send(data: string): void;
		readyState?: number;
		binaryType?: BinaryType;
	} {
		return new WebSocket(url) as unknown as WebSocketLike & {
			send(data: string): void;
		};
	}
}

type RelayTask = (input: unknown) => Promise<unknown>;
type TaskSocket = {
	close(): void;
	send(data: string): void;
	onopen: ((event: Event) => void) | null;
	onmessage: ((event: MessageEvent) => void) | null;
	onerror: ((event: Event) => void) | null;
	onclose: ((event: CloseEvent) => void) | null;
};
type TaskSocketFactory = (url: string) => TaskSocket;
type TaskScheduler = {
	setInterval(callback: () => void, intervalMs: number): unknown;
	clearInterval(timer: unknown): void;
	setTimeout(callback: () => void, timeoutMs: number): unknown;
	clearTimeout(timer: unknown): void;
};
const defaultTaskScheduler: TaskScheduler = {
	setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
	clearInterval: (timer) =>
		clearInterval(timer as ReturnType<typeof setInterval>),
	setTimeout: (callback, timeoutMs) => setTimeout(callback, timeoutMs),
	clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
type TaskClientOptions = {
	scheduler?: TaskScheduler;
	helloTimeoutMs?: number;
	maxConcurrentRequests?: number;
};

export const AUTOMATE_RELAY_ORIGIN = "https://automate.corp.kuaishou.com";
export const AUTOMATE_RELAY_WEBAPP_PATH = "/webapp/16740";
export const EMPTY_RELAY_PULL_DELAY_MS = 50;
const DEFAULT_MAX_CONCURRENT_TASK_REQUESTS = 4;
function unwrapRelayResult(payload: unknown): unknown {
	if (typeof payload !== "object" || payload === null) return payload;
	if (!("result" in payload)) return payload;
	return (payload as { result: unknown }).result;
}

function assertRelaySuccess(result: unknown): void {
	if (
		typeof result === "object" &&
		result !== null &&
		"ok" in result &&
		(result as { ok?: unknown }).ok === false
	) {
		throw new Error("AutoMate relay operation failed");
	}
}

function relayError(payload: unknown): Error {
	if (typeof payload === "string") return new Error(payload);
	if (typeof payload === "object" && payload !== null) {
		const message = (payload as { message?: unknown }).message;
		if (typeof message === "string") return new Error(message);
	}
	return new Error("AutoMate relay operation failed");
}

type QueuedTask = {
	input: unknown;
	resolve: (result: unknown) => void;
	reject: (error: Error) => void;
};
type ActiveTask = QueuedTask & { requestId: string };

/** A hello-gated connection to AutoMate task 16739 with bounded in-flight work. */
export class AutoMateTaskClient {
	private socket: TaskSocket | undefined;
	private receivedHello = false;
	private readonly active = new Map<string, ActiveTask>();
	private readonly queue: QueuedTask[] = [];
	private readonly scheduler: TaskScheduler;
	private readonly helloTimeoutMs: number;
	private readonly maxConcurrentRequests: number;
	private heartbeatTimer: unknown;
	private helloTimer: unknown;
	constructor(
		private readonly url: string,
		private readonly createSocket: TaskSocketFactory = (socketUrl) =>
			new WebSocket(socketUrl),
		options: TaskClientOptions = {},
	) {
		this.scheduler = options.scheduler ?? defaultTaskScheduler;
		this.helloTimeoutMs = options.helloTimeoutMs ?? 20_000;
		this.maxConcurrentRequests =
			options.maxConcurrentRequests ?? DEFAULT_MAX_CONCURRENT_TASK_REQUESTS;
	}
	run(input: unknown): Promise<unknown> {
		return new Promise((resolve, reject) => {
			this.queue.push({ input, resolve, reject });
			this.connect();
			this.drain();
		});
	}
	close(): void {
		this.failAll(new Error("AutoMate relay transport stopped"));
	}
	private connect(): void {
		if (this.socket) return;
		try {
			const socket = this.createSocket(this.url);
			this.socket = socket;
			this.helloTimer = this.scheduler.setTimeout(() => {
				if (this.socket === socket && !this.receivedHello) {
					this.failAll(new Error("AutoMate relay hello timed out"));
				}
			}, this.helloTimeoutMs);
			socket.onmessage = (event) => {
				if (this.socket === socket) this.receive(event);
			};
			socket.onerror = () => {
				if (this.socket === socket) {
					this.failAll(new Error("AutoMate relay WebSocket error"));
				}
			};
			socket.onclose = () => {
				if (this.socket === socket) {
					this.failAll(new Error("AutoMate relay WebSocket closed"));
				}
			};
		} catch {
			this.failAll(new Error("AutoMate relay WebSocket connection failed"));
		}
	}
	private receive(event: MessageEvent): void {
		let message: {
			type?: unknown;
			request_id?: unknown;
			payload?: unknown;
			heartbeat_interval_ms?: unknown;
		};
		try {
			message = JSON.parse(String(event.data));
		} catch {
			this.failAll(new Error("AutoMate relay sent invalid JSON"));
			return;
		}
		if (message.type === "hello") {
			this.receivedHello = true;
			this.clearHelloTimer();
			this.startHeartbeat(heartbeatInterval(message));
			this.drain();
			return;
		}
		if (message.type === "pong") return;
		if (message.type === "auth_error") {
			this.failAll(relayError(message.payload));
			return;
		}
		if (typeof message.request_id !== "string") {
			this.failAll(
				new Error("AutoMate relay returned an unexpected request ID"),
			);
			return;
		}
		const active = this.active.get(message.request_id);
		if (!active) {
			this.failAll(
				new Error("AutoMate relay returned an unexpected request ID"),
			);
			return;
		}
		this.active.delete(message.request_id);
		if (message.type === "done") {
			const result = unwrapRelayResult(message.payload);
			try {
				assertRelaySuccess(result);
				active.resolve(result);
			} catch (error) {
				active.reject(error instanceof Error ? error : relayError(error));
			}
		} else if (message.type === "error") {
			active.reject(relayError(message.payload));
		} else {
			this.failAll(new Error("AutoMate relay returned an unknown response"));
			return;
		}
		this.drain();
	}
	private drain(): void {
		if (!this.socket || !this.receivedHello) return;
		while (
			this.active.size < this.maxConcurrentRequests &&
			this.queue.length > 0
		) {
			const queued = this.queue.shift();
			if (!queued) return;
			const requestId = crypto.randomUUID();
			this.active.set(requestId, { ...queued, requestId });
			try {
				this.socket.send(
					JSON.stringify({
						type: "msg",
						request_id: requestId,
						payload: queued.input,
					}),
				);
			} catch {
				this.failAll(new Error("AutoMate relay WebSocket send failed"));
				return;
			}
		}
	}
	private failAll(error: Error): void {
		const socket = this.socket;
		this.socket = undefined;
		this.receivedHello = false;
		this.clearTimers();
		for (const active of this.active.values()) active.reject(error);
		this.active.clear();
		for (const queued of this.queue.splice(0)) queued.reject(error);
		socket?.close();
	}
	private startHeartbeat(interval: unknown): void {
		if (
			typeof interval !== "number" ||
			!Number.isFinite(interval) ||
			interval <= 0
		) {
			return;
		}
		if (this.heartbeatTimer !== undefined) return;
		this.heartbeatTimer = this.scheduler.setInterval(() => {
			try {
				this.socket?.send(JSON.stringify({ type: "ping" }));
			} catch {
				this.failAll(new Error("AutoMate relay heartbeat failed"));
			}
		}, interval);
	}
	private clearHelloTimer(): void {
		if (this.helloTimer === undefined) return;
		this.scheduler.clearTimeout(this.helloTimer);
		this.helloTimer = undefined;
	}
	private clearTimers(): void {
		this.clearHelloTimer();
		if (this.heartbeatTimer === undefined) return;
		this.scheduler.clearInterval(this.heartbeatTimer);
		this.heartbeatTimer = undefined;
	}
}

function heartbeatInterval(message: {
	payload?: unknown;
	heartbeat_interval_ms?: unknown;
}): unknown {
	if (message.heartbeat_interval_ms !== undefined)
		return message.heartbeat_interval_ms;
	if (typeof message.payload !== "object" || message.payload === null)
		return undefined;
	return (message.payload as { heartbeat_interval_ms?: unknown })
		.heartbeat_interval_ms;
}

function getAutoMateRelayUrl(): string {
	const url = import.meta.env.VITE_AUTOMATE_RELAY_URL;
	if (!url) {
		throw new Error(
			"AutoMate relay requires VITE_AUTOMATE_RELAY_URL at build time",
		);
	}
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "wss:") throw new Error("invalid protocol");
	} catch {
		throw new Error("VITE_AUTOMATE_RELAY_URL must be a valid wss:// URL");
	}
	return url;
}

export function isAutoMateRelayLocation(
	location: Pick<Location, "origin" | "pathname">,
): boolean {
	return (
		location.origin === AUTOMATE_RELAY_ORIGIN &&
		(location.pathname === AUTOMATE_RELAY_WEBAPP_PATH ||
			location.pathname.startsWith(`${AUTOMATE_RELAY_WEBAPP_PATH}/`))
	);
}

export function getAutoMateRelayMailboxId(
	location: Pick<Location, "origin" | "pathname" | "search" | "hash">,
	storedMailboxId: string,
): string {
	if (!isAutoMateRelayLocation(location)) return "";
	const hashParams = getAutoMatePairingHashParams(location.hash);
	const { mailboxId } = getPairingCredentials(
		new URLSearchParams(location.search),
		hashParams.code
			? hashParams
			: getAutoMatePairingPathParams(location.pathname),
	);
	return mailboxId ?? storedMailboxId;
}
type RelayMessage = { seq: number; messageId: string; body: RelayEnvelope };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function bytesToBase64(data: ArrayBuffer): string {
	const bytes = new Uint8Array(data);
	const chunks: string[] = [];
	const chunkSize = 0x8000;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		chunks.push(
			String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)),
		);
	}
	return btoa(chunks.join(""));
}
const base64ToBytes = (data?: string) =>
	Uint8Array.from(atob(data ?? ""), (char) => char.charCodeAt(0));

/** One ordered s2c puller per mailbox. It does not know or possess a host PSK. */
export class AutoMateRelayTransport implements PhoneTransport {
	private readonly pending = new Map<
		string,
		{ resolve: (response: Response) => void; reject: (error: Error) => void }
	>();
	private readonly channels = new Map<string, RelayPollingSocket>();
	private pushTail = Promise.resolve();
	private pumping = false;
	constructor(
		readonly mailboxId: string,
		private readonly taskClient: {
			run: RelayTask;
			close?: () => void;
		} = new AutoMateTaskClient(getAutoMateRelayUrl()),
	) {}
	stop(): void {
		this.pumping = false;
		for (const pending of this.pending.values()) {
			pending.reject(new Error("AutoMate relay transport stopped"));
		}
		this.pending.clear();
		for (const channel of this.channels.values()) {
			channel.receiveClose(1000, "AutoMate relay transport stopped");
		}
		this.channels.clear();
		this.taskClient.close?.();
	}
	private async task(input: unknown): Promise<unknown> {
		const result = await this.taskClient.run(input);
		assertRelaySuccess(result);
		return result;
	}
	private async push(body: RelayEnvelope): Promise<void> {
		return this.enqueuePush(() =>
			this.task({
				op: "push",
				mailboxId: this.mailboxId,
				direction: "c2s",
				messageId: crypto.randomUUID(),
				body,
			}),
		);
	}
	private enqueuePush(operation: () => Promise<unknown>): Promise<void> {
		const pushed = this.pushTail.then(async () => {
			await operation();
		});
		this.pushTail = pushed.catch(() => {});
		return pushed;
	}
	private async ack(seq: number): Promise<void> {
		await this.task({
			op: "ack",
			mailboxId: this.mailboxId,
			direction: "s2c",
			seq,
		});
	}
	private startPump(): void {
		if (!this.pumping) {
			this.pumping = true;
			void this.pump();
		}
	}
	private async pump(): Promise<void> {
		while (this.pumping) {
			try {
				const result = (await this.task({
					op: "pull",
					mailboxId: this.mailboxId,
					direction: "s2c",
				})) as { message?: RelayMessage };
				const message = result?.message;
				if (!message) {
					await wait(EMPTY_RELAY_PULL_DELAY_MS);
					continue;
				}
				const body = message.body;
				if (body.kind === "http.response") {
					const pending = this.pending.get(body.requestId);
					if (pending) {
						this.pending.delete(body.requestId);
						pending.resolve(
							new Response(base64ToBytes(body.body), {
								status: body.status,
								headers: body.headers,
							}),
						);
					}
					// A response without a pending request is explicitly stale.
					await this.ack(message.seq);
					continue;
				}
				if (body.kind === "stream.frame") {
					const channel = this.channels.get(body.channelId);
					if (channel) {
						channel.receive(
							body.body.type === "text"
								? body.body.data
								: base64ToBytes(body.body.data).buffer,
						);
					}
					await this.ack(message.seq);
					continue;
				}
				if (body.kind === "stream.frames") {
					for (const frame of body.frames) {
						const channel = this.channels.get(frame.channelId);
						if (!channel) continue;
						channel.receive(
							frame.body.type === "text"
								? frame.body.data
								: base64ToBytes(frame.body.data).buffer,
						);
					}
					await this.ack(message.seq);
					continue;
				}
				if (body.kind === "stream.close") {
					this.channels
						.get(body.channelId)
						?.receiveClose(body.code, body.reason);
					this.channels.delete(body.channelId);
					await this.ack(message.seq);
					continue;
				}
				// Unknown/invalid correlation is a poison message: ack to avoid blocking the ordered mailbox.
				await this.ack(message.seq);
			} catch (error) {
				console.warn("[phone-relay] pull failed", error);
				await wait(1_000);
			}
		}
	}
	async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
		const request = new Request(input, init);
		const requestId = crypto.randomUUID();
		const url = new URL(
			request.url,
			typeof location === "undefined" ? "http://localhost" : location.origin,
		);
		const body = request.body
			? bytesToBase64(await request.arrayBuffer())
			: undefined;
		this.startPump();
		const result = new Promise<Response>((resolve, reject) =>
			this.pending.set(requestId, { resolve, reject }),
		);
		try {
			await this.push({
				kind: "http.request",
				requestId,
				path: `${url.pathname}${url.search}`,
				method: request.method,
				headers: Object.fromEntries(request.headers.entries()),
				body,
			});
		} catch (error) {
			this.pending.delete(requestId);
			throw error;
		}
		return result;
	}
	createWebSocket(url: string): WebSocketLike & {
		send(data: string): void;
		readyState?: number;
		binaryType?: BinaryType;
	} {
		const channel = new RelayPollingSocket(this, url);
		this.channels.set(channel.channelId, channel);
		this.startPump();
		void channel.open();
		return channel;
	}
	async openChannel(channel: RelayPollingSocket, url: string): Promise<void> {
		const parsed = new URL(
			url,
			typeof location === "undefined" ? "http://localhost" : location.origin,
		);
		await this.push({
			kind: "stream.open",
			channelId: channel.channelId,
			path: `${parsed.pathname}${parsed.search}`,
			headers: {},
		});
	}
	async closeChannel(
		channelId: string,
		code?: number,
		reason?: string,
	): Promise<void> {
		this.channels.delete(channelId);
		await this.push({ kind: "stream.close", channelId, code, reason });
	}
	async sendChannel(channelId: string, data: string): Promise<void> {
		await this.push({
			kind: "stream.frame",
			channelId,
			body: { type: "text", data },
		});
	}
}

class RelayPollingSocket implements WebSocketLike {
	readonly readyState = WebSocket.OPEN;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	readonly channelId = crypto.randomUUID();
	private closed = false;
	constructor(
		private readonly transport: AutoMateRelayTransport,
		private readonly url: string,
	) {}
	async open(): Promise<void> {
		try {
			await this.transport.openChannel(this, this.url);
			if (!this.closed) this.onopen?.();
		} catch (error) {
			this.onerror?.(error);
			this.close();
		}
	}
	receive(data: unknown): void {
		if (!this.closed) this.onmessage?.({ data });
	}
	receiveClose(code?: number, reason?: string): void {
		if (!this.closed) {
			this.closed = true;
			this.onclose?.({ code, reason });
		}
	}
	close(code?: number, reason?: string): void {
		if (this.closed) return;
		this.closed = true;
		void this.transport.closeChannel(this.channelId, code, reason);
		this.onclose?.({ code, reason });
	}
	send(data: string): void {
		if (!this.closed) void this.transport.sendChannel(this.channelId, data);
	}
}

let direct: DirectTransport | undefined;
let relay: AutoMateRelayTransport | undefined;
export function getPhoneTransport(): PhoneTransport {
	const mailbox = getAutoMateRelayMailboxId(
		location,
		getStoredRelayMailboxId(),
	);
	if (mailbox) {
		if (!relay || relay.mailboxId !== mailbox) {
			relay?.stop();
			relay = new AutoMateRelayTransport(mailbox);
		}
		return relay;
	}
	if (!direct) direct = new DirectTransport();
	return direct;
}
