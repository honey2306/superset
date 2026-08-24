import { describe, expect, test } from "bun:test";
import type { RelayEnvelope } from "@superset/session-protocol";
import {
	AutoMateRelayTransport,
	AutoMateTaskClient,
	EMPTY_RELAY_PULL_DELAY_MS,
	getAutoMateRelayMailboxId,
	getPhoneTransport,
	isAutoMateRelayLocation,
} from "./transport";

class FakeTaskSocket {
	onopen: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;
	readonly sent: string[] = [];
	send(data: string): void {
		this.sent.push(data);
	}
	close(): void {}
	emit(message: unknown): void {
		this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
	}
}

class FakeTaskScheduler {
	private nextTimer = 0;
	readonly intervals = new Map<number, () => void>();
	readonly timeouts = new Map<number, () => void>();
	setInterval(callback: () => void): number {
		const timer = this.nextTimer++;
		this.intervals.set(timer, callback);
		return timer;
	}
	clearInterval(timer: unknown): void {
		this.intervals.delete(timer as number);
	}
	setTimeout(callback: () => void): number {
		const timer = this.nextTimer++;
		this.timeouts.set(timer, callback);
		return timer;
	}
	clearTimeout(timer: unknown): void {
		this.timeouts.delete(timer as number);
	}
	runIntervals(): void {
		for (const callback of this.intervals.values()) callback();
	}
	runTimeouts(): void {
		for (const callback of this.timeouts.values()) callback();
	}
}

describe("AutoMateRelayTransport", () => {
	test("uses a QPS-safe empty-mailbox poll delay", () => {
		expect(EMPTY_RELAY_PULL_DELAY_MS).toBe(500);
	});

	test("decodes binary server frames without UTF-8 coercion", async () => {
		let pullCount = 0;
		const transport = new AutoMateRelayTransport("mailbox", {
			run: async (input) => {
				const operation = input as { op: string; body?: RelayEnvelope };
				if (operation.op === "pull" && pullCount++ === 0) {
					return {
						message: {
							seq: 11,
							messageId: "binary-frame",
							body: {
								kind: "stream.frame",
								channelId: "channel-1",
								body: { type: "binary", data: btoa("\u0000ÿ") },
							} satisfies RelayEnvelope,
						},
					};
				}
				return { ok: true };
			},
		});
		const received: unknown[] = [];
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		transport["channels"].set("channel-1", {
			receive: (data: unknown) => received.push(data),
			receiveClose: () => {},
		});
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		transport["startPump"]();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect([...new Uint8Array(received[0] as ArrayBuffer)]).toEqual([0, 255]);
		transport.stop();
	});

	test("delivers batched server frames in order and acknowledges the batch once", async () => {
		const acknowledgements: unknown[] = [];
		let transport: AutoMateRelayTransport;
		let delivered = false;
		const done = new Promise<void>((resolve) => {
			transport = new AutoMateRelayTransport("mailbox", {
				run: async (input) => {
					const operation = input as { op: string };
					if (operation.op === "pull" && !delivered) {
						delivered = true;
						return {
							message: {
								seq: 13,
								messageId: "frame-batch",
								body: {
									kind: "stream.frames",
									frames: [
										{
											channelId: "channel-1",
											body: { type: "text", data: "one" },
										},
										{
											channelId: "channel-1",
											body: { type: "text", data: "two" },
										},
										{
											channelId: "channel-1",
											body: { type: "text", data: "three" },
										},
									],
								} satisfies RelayEnvelope,
							},
						};
					}
					if (operation.op === "ack") {
						acknowledgements.push(input);
						transport.stop();
						resolve();
					}
					return { ok: true };
				},
			});
		});
		const received: unknown[] = [];
		if (!transport) throw new Error("Expected relay transport");
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		transport["channels"].set("channel-1", {
			receive: (data: unknown) => received.push(data),
			receiveClose: () => {},
		});
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		transport["startPump"]();
		await done;

		expect(received).toEqual(["one", "two", "three"]);
		expect(acknowledgements).toEqual([
			{ op: "ack", mailboxId: "mailbox", direction: "s2c", seq: 13 },
		]);
	});

	test("carries the phone bearer through push/pull/ack and acks the response", async () => {
		let request: Extract<RelayEnvelope, { kind: "http.request" }> | undefined;
		const acknowledged: unknown[] = [];
		let pulledResponse = false;
		let releasePull: (() => void) | undefined;
		const requestPushed = new Promise<void>((resolve) => {
			releasePull = resolve;
		});
		const relayTask = async (input: unknown): Promise<unknown> => {
			const operation = input as {
				op: string;
				body?: RelayEnvelope;
			};
			if (operation.op === "push") {
				if (operation.body?.kind === "http.request") {
					request = operation.body;
					releasePull?.();
				}
				return { ok: true };
			}
			if (operation.op === "pull") {
				await requestPushed;
				if (pulledResponse) return { message: null };
				pulledResponse = true;
				return {
					message: {
						seq: 41,
						messageId: "response-message",
						body: {
							kind: "http.response",
							requestId: request?.requestId ?? "missing",
							status: 200,
							headers: { "content-type": "text/plain" },
							body: btoa("ok"),
						} satisfies RelayEnvelope,
					},
				};
			}
			if (operation.op === "ack") acknowledged.push(operation);
			return { ok: true };
		};
		const transport = new AutoMateRelayTransport("mailbox", {
			run: relayTask,
		});

		const response = await transport.fetch("http://phone.test/trpc/phone.me", {
			method: "POST",
			headers: { authorization: "Bearer phone-token" },
			body: "payload",
		});

		expect(await response.text()).toBe("ok");
		expect(request?.headers.authorization).toBe("Bearer phone-token");
		expect(acknowledged).toEqual([
			{
				op: "ack",
				mailboxId: "mailbox",
				direction: "s2c",
				seq: 41,
			},
		]);
		expect(acknowledged[0]).not.toHaveProperty("messageId");
		transport.stop();
	});

	test("acknowledges an uncorrelated response by sequence", async () => {
		const acknowledgements: unknown[] = [];
		let transport: AutoMateRelayTransport;
		let resolveDone: (() => void) | undefined;
		const done = new Promise<void>((resolve) => {
			resolveDone = resolve;
		});
		transport = new AutoMateRelayTransport("mailbox", {
			run: async (input) => {
				const operation = input as { op: string };
				if (operation.op === "pull") {
					return {
						message: {
							seq: 53,
							messageId: "stale-response",
							body: {
								kind: "http.response",
								requestId: "unknown-request",
								status: 200,
								headers: {},
								body: "",
							} satisfies RelayEnvelope,
						},
					};
				}
				acknowledgements.push(input);
				transport.stop();
				resolveDone?.();
				return { ok: true };
			},
		});
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		transport["startPump"]();
		await done;

		expect(acknowledgements).toEqual([
			{
				op: "ack",
				mailboxId: "mailbox",
				direction: "s2c",
				seq: 53,
			},
		]);
		expect(acknowledgements[0]).not.toHaveProperty("messageId");
	});

	test("serializes c2s push envelopes", async () => {
		let releaseFirstPush: (() => void) | undefined;
		const firstPush = new Promise<void>((resolve) => {
			releaseFirstPush = resolve;
		});
		const pushes: unknown[] = [];
		const transport = new AutoMateRelayTransport("mailbox", {
			run: async (input) => {
				const operation = input as { op: string };
				if (operation.op !== "push") return { ok: true };
				pushes.push(input);
				if (pushes.length === 1) await firstPush;
				return { ok: true };
			},
		});
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		const first = transport["push"]({
			kind: "stream.open",
			channelId: "first",
			path: "/terminal/first",
			headers: {},
		});
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		const second = transport["push"]({
			kind: "stream.close",
			channelId: "first",
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(pushes).toHaveLength(1);
		releaseFirstPush?.();
		await Promise.all([first, second]);
		expect(pushes).toHaveLength(2);
	});

	test("sends a push while an earlier pull remains unresolved", async () => {
		const socket = new FakeTaskSocket();
		const client = new AutoMateTaskClient(
			"wss://relay.test/ws?token=test",
			() => socket,
		);
		const pull = client.run({ op: "pull" });
		const push = client.run({ op: "push" });

		expect(socket.sent).toEqual([]);
		socket.emit({ type: "hello" });
		expect(socket.sent).toHaveLength(2);
		const pullRequest = JSON.parse(socket.sent[0] ?? "");
		const pushRequest = JSON.parse(socket.sent[1] ?? "");
		expect(pullRequest).toMatchObject({
			type: "msg",
			payload: { op: "pull" },
		});
		expect(pushRequest).toMatchObject({ type: "msg", payload: { op: "push" } });
		socket.emit({
			type: "done",
			request_id: pushRequest.request_id,
			payload: { result: { order: 2 } },
		});
		expect(await push).toEqual({ order: 2 });
		socket.emit({
			type: "done",
			request_id: pullRequest.request_id,
			payload: { result: { order: 1 } },
		});
		expect(await pull).toEqual({ order: 1 });
	});

	test("rejects task errors, auth errors, and closed connections", async () => {
		const socket = new FakeTaskSocket();
		const client = new AutoMateTaskClient(
			"wss://relay.test/ws?token=test",
			() => socket,
		);
		const failed = client.run({ op: "fail" });
		socket.emit({ type: "hello" });
		const request = JSON.parse(socket.sent[0] ?? "");
		socket.emit({
			type: "error",
			request_id: request.request_id,
			payload: { message: "task failed" },
		});
		await expect(failed).rejects.toThrow("task failed");

		const authFailed = client.run({ op: "auth" });
		socket.emit({ type: "hello" });
		socket.emit({ type: "auth_error", payload: { message: "not authorized" } });
		await expect(authFailed).rejects.toThrow("not authorized");

		const closingSocket = new FakeTaskSocket();
		const closingClient = new AutoMateTaskClient(
			"wss://relay.test/ws?token=test",
			() => closingSocket,
		);
		const closing = closingClient.run({ op: "close" });
		closingSocket.emit({ type: "hello" });
		closingSocket.onclose?.({} as CloseEvent);
		await expect(closing).rejects.toThrow("AutoMate relay WebSocket closed");
	});

	test("heartbeats alongside in-flight work and clears timers on close", async () => {
		const socket = new FakeTaskSocket();
		const scheduler = new FakeTaskScheduler();
		const client = new AutoMateTaskClient(
			"wss://relay.test/ws?token=test",
			() => socket,
			{ scheduler, helloTimeoutMs: 1 },
		);
		const first = client.run({ op: "first" });
		const second = client.run({ op: "second" });
		socket.emit({
			type: "hello",
			payload: { heartbeat_interval_ms: 1 },
		});
		const firstRequest = JSON.parse(socket.sent[0] ?? "");
		scheduler.runIntervals();
		expect(JSON.parse(socket.sent[2] ?? "")).toEqual({ type: "ping" });
		socket.emit({ type: "pong" });
		expect(socket.sent).toHaveLength(3);
		socket.emit({
			type: "done",
			request_id: firstRequest.request_id,
			payload: { result: { order: 1 } },
		});
		expect(await first).toEqual({ order: 1 });
		expect(JSON.parse(socket.sent[1] ?? "")).toMatchObject({
			type: "msg",
			payload: { op: "second" },
		});
		client.close();
		await expect(second).rejects.toThrow("AutoMate relay transport stopped");
		expect(scheduler.intervals).toHaveLength(0);
		expect(scheduler.timeouts).toHaveLength(0);
	});

	test("rejects queued work when the server never sends hello", async () => {
		const socket = new FakeTaskSocket();
		const scheduler = new FakeTaskScheduler();
		const client = new AutoMateTaskClient(
			"wss://relay.test/ws?token=test",
			() => socket,
			{ scheduler, helloTimeoutMs: 1 },
		);
		const pending = client.run({ op: "wait" });
		scheduler.runTimeouts();
		await expect(pending).rejects.toThrow("AutoMate relay hello timed out");
		expect(scheduler.timeouts).toHaveLength(0);
	});

	test("only enables the relay on the trusted AutoMate WebApp origin and path", () => {
		expect(
			isAutoMateRelayLocation({
				origin: "https://automate.corp.kuaishou.com",
				pathname: "/webapp/16740/w/workspace",
			}),
		).toBe(true);
		expect(
			isAutoMateRelayLocation({
				origin: "https://untrusted.example",
				pathname: "/webapp/16740",
			}),
		).toBe(false);
		expect(
			isAutoMateRelayLocation({
				origin: "https://automate.corp.kuaishou.com",
				pathname: "/app",
			}),
		).toBe(false);
	});

	test("selects the relay mailbox from a trusted fragment pairing route", () => {
		expect(
			getAutoMateRelayMailboxId(
				{
					origin: "https://automate.corp.kuaishou.com",
					pathname: "/webapp/16740",
					search: "",
					hash: "#/pair/CODE/mailbox-1",
				},
				"",
			),
		).toBe("mailbox-1");
	});

	test("does not fall back to same-origin requests on a mailbox-less AutoMate page", () => {
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
		Object.defineProperty(globalThis, "location", {
			configurable: true,
			value: {
				origin: "https://automate.corp.kuaishou.com",
				pathname: "/webapp/16740",
				search: "",
				hash: "#/pair",
			},
		});
		try {
			expect(() => getPhoneTransport()).toThrow(
				"needs the pairing link generated",
			);
		} finally {
			if (descriptor) Object.defineProperty(globalThis, "location", descriptor);
			else delete (globalThis as { location?: unknown }).location;
		}
	});
});
