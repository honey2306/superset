import { describe, expect, test } from "bun:test";
import {
	AutoMateRelay,
	AutoMateRelayTaskClient,
	isAllowedPath,
} from "./AutoMateRelay";

class FakeRelaySocket {
	readyState = 1;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	sent: unknown[] = [];
	send(data: string): void {
		this.sent.push(JSON.parse(data));
	}
	close(): void {
		this.onclose?.();
	}
	emit(message: unknown): void {
		this.onmessage?.({ data: JSON.stringify(message) });
	}
}

async function nextTurn(): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("AutoMateRelay", () => {
	test("rejects paths outside tRPC and ACP streams", () => {
		expect(isAllowedPath("/trpc/phone.pairing.redeem")).toBe(true);
		expect(isAllowedPath("/trpc/acpSessions.get?input=encoded")).toBe(true);
		expect(isAllowedPath("/trpc/terminalAgents.listByWorkspace")).toBe(true);
		expect(isAllowedPath("/trpc/terminalAgents.getOrCreate")).toBe(true);
		expect(isAllowedPath("/trpc/terminalAgents.list")).toBe(false);
		expect(isAllowedPath("/acp-sessions/a/stream?token=phone")).toBe(true);
		expect(isAllowedPath("https://evil.example/trpc")).toBe(false);
		expect(isAllowedPath("/trpc/notifications.hook")).toBe(false);
		expect(isAllowedPath("/trpc/phone.me%2Cnotifications.hook?batch=1")).toBe(
			false,
		);
		expect(isAllowedPath("/terminal/x")).toBe(true);
		expect(isAllowedPath("/terminal/x/extra")).toBe(false);
	});
	test("forwards the phone Authorization header without replacing it", async () => {
		let forwarded: RequestInit | undefined;
		const pushed: unknown[] = [];
		const relay = new AutoMateRelay("box", {
			client: {
				request: async (input) => {
					pushed.push(input);
					return {};
				},
			},
			fetch: async (_url, init) => {
				forwarded = init;
				return new Response("ok");
			},
			baseUrl: "http://127.0.0.1:4879",
		});
		// Private transport plumbing is exercised directly so the assertion stays
		// focused on the credential boundary instead of the mailbox poll loop.
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		await relay["forward"]({
			kind: "http.request",
			requestId: "r",
			path: "/trpc/host.info",
			method: "POST",
			headers: { authorization: "Bearer phone-token", host: "evil.example" },
		});
		expect(new Headers(forwarded?.headers).get("authorization")).toBe(
			"Bearer phone-token",
		);
		expect(new Headers(forwarded?.headers).get("host")).toBeNull();
		expect(JSON.stringify(pushed)).toContain("http.response");
	});

	test("retries an unacked request without duplicating a completed response", async () => {
		const request = {
			kind: "http.request",
			requestId: "request-1",
			path: "/trpc/phone.me",
			method: "POST",
			headers: { authorization: "Bearer phone-token" },
		} as const;
		let relay: AutoMateRelay;
		let pushCount = 0;
		let ackCount = 0;
		let resolveDone: (() => void) | undefined;
		const done = new Promise<void>((resolve) => {
			resolveDone = resolve;
		});
		relay = new AutoMateRelay("box", {
			client: {
				request: async (input) => {
					const operation = input as { op: string };
					if (operation.op === "pull") {
						return { message: { messageId: "message-1", body: request } };
					}
					if (operation.op === "push") {
						pushCount += 1;
						return { ok: true };
					}
					ackCount += 1;
					if (ackCount === 1) throw new Error("ack interrupted");
					relay.stop();
					resolveDone?.();
					return { ok: true };
				},
			},
			fetch: async () => new Response("ok"),
			baseUrl: "http://127.0.0.1:4879",
			sleep: async () => {},
		});

		relay.start();
		await done;

		expect(pushCount).toBe(1);
		expect(ackCount).toBe(2);
	});

	test("forwards a phone stream frame to its host WebSocket", async () => {
		const sent: string[] = [];
		let relay: AutoMateRelay;
		let resolveDone: (() => void) | undefined;
		const done = new Promise<void>((resolve) => {
			resolveDone = resolve;
		});
		relay = new AutoMateRelay("box", {
			client: {
				request: async (input) => {
					const operation = input as { op: string };
					if (operation.op === "pull") {
						return {
							message: {
								messageId: "phone-frame",
								body: {
									kind: "stream.frame",
									channelId: "channel-1",
									body: { type: "text", data: "phone input" },
								},
							},
						};
					}
					relay.stop();
					resolveDone?.();
					return { ok: true };
				},
			},
			fetch: async () => new Response("unused"),
			baseUrl: "http://127.0.0.1:4879",
			sleep: async () => {},
		});
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		relay["streams"].set("channel-1", {
			send: (body: string) => sent.push(body),
			close: () => {},
		} as unknown as WebSocket);

		relay.start();
		await done;

		expect(sent).toEqual(["phone input"]);
	});

	test("preserves binary phone stream frames for its host WebSocket", async () => {
		const sent: Buffer[] = [];
		const relay = new AutoMateRelay("box", {
			client: { request: async () => ({ ok: true }) },
			fetch: async () => new Response("unused"),
			baseUrl: "http://127.0.0.1:4879",
		});
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		relay["streams"].set("channel-1", {
			send: (body: Buffer) => sent.push(body),
			close: () => {},
		} as unknown as WebSocket);
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		await relay["forwardStreamFrame"]({
			kind: "stream.frame",
			channelId: "channel-1",
			body: {
				type: "binary",
				data: Buffer.from([0, 255, 1]).toString("base64"),
			},
		});
		const firstFrame = sent.at(0);
		if (!firstFrame) throw new Error("Expected a binary frame");
		expect([...firstFrame]).toEqual([0, 255, 1]);
	});

	test("closes and acknowledges a frame for an unknown stream", async () => {
		const requests: unknown[] = [];
		let relay: AutoMateRelay;
		let resolveDone: (() => void) | undefined;
		const done = new Promise<void>((resolve) => {
			resolveDone = resolve;
		});
		relay = new AutoMateRelay("box", {
			client: {
				request: async (input) => {
					requests.push(input);
					const operation = input as { op: string };
					if (operation.op === "pull") {
						return {
							message: {
								messageId: "stale-frame",
								body: {
									kind: "stream.frame",
									channelId: "missing",
									body: { type: "text", data: "late input" },
								},
							},
						};
					}
					if (operation.op === "ack") {
						relay.stop();
						resolveDone?.();
					}
					return { ok: true };
				},
			},
			fetch: async () => new Response("unused"),
			baseUrl: "http://127.0.0.1:4879",
			sleep: async () => {},
		});

		relay.start();
		await done;

		expect(requests).toContainEqual(
			expect.objectContaining({
				op: "push",
				body: {
					kind: "stream.close",
					channelId: "missing",
					code: 1002,
					reason: "Unknown relay stream",
				},
			}),
		);
		expect(requests).toContainEqual(
			expect.objectContaining({
				op: "ack",
				messageId: "stale-frame",
			}),
		);
	});
});

describe("AutoMateRelayTaskClient", () => {
	test("waits for hello and wraps operations in msg/done envelopes", async () => {
		const socket = new FakeRelaySocket();
		const client = new AutoMateRelayTaskClient(
			"wss://relay.example/ws",
			() => socket,
		);
		const result = client.request({ op: "pull", mailboxId: "box" });
		await nextTurn();
		expect(socket.sent).toEqual([]);
		socket.emit({ type: "hello" });
		await nextTurn();
		expect(socket.sent).toHaveLength(1);
		const request = socket.sent[0] as {
			type: string;
			request_id: string;
			payload: unknown;
		};
		expect(request.type).toBe("msg");
		expect(request.payload).toEqual({ op: "pull", mailboxId: "box" });
		socket.emit({
			type: "done",
			request_id: request.request_id,
			payload: { result: { message: null } },
		});
		expect(await result).toEqual({ message: null });
	});

	test("keeps FIFO work pending for a matching done and rejects auth errors", async () => {
		const socket = new FakeRelaySocket();
		const client = new AutoMateRelayTaskClient(
			"wss://relay.example/ws",
			() => socket,
		);
		const first = client.request({ op: "health" });
		const second = client.request({ op: "pull" });
		await nextTurn();
		socket.emit({ type: "hello" });
		await nextTurn();
		const firstMessage = socket.sent[0] as { request_id: string };
		socket.emit({
			type: "done",
			request_id: "other",
			payload: { result: "wrong" },
		});
		expect(socket.sent).toHaveLength(1);
		socket.emit({
			type: "done",
			request_id: firstMessage.request_id,
			payload: { result: "ok" },
		});
		expect(await first).toBe("ok");
		await nextTurn();
		const secondMessage = socket.sent[1] as { request_id: string };
		socket.emit({ type: "auth_error", request_id: secondMessage.request_id });
		await expect(second).rejects.toThrow("auth_error");
	});

	test("rejects immediately when auth fails before hello", async () => {
		const socket = new FakeRelaySocket();
		const client = new AutoMateRelayTaskClient(
			"wss://relay.example/ws",
			() => socket,
		);
		const request = client.request({ op: "health" });
		await nextTurn();
		socket.emit({ type: "auth_error", payload: { message: "token expired" } });
		await expect(request).rejects.toThrow("auth_error: token expired");
	});

	test("sends the hello-advertised heartbeat", async () => {
		const socket = new FakeRelaySocket();
		const client = new AutoMateRelayTaskClient(
			"wss://relay.example/ws",
			() => socket,
		);
		const request = client.request({ op: "health" });
		await nextTurn();
		socket.emit({
			type: "hello",
			payload: { heartbeat_interval_ms: 1 },
		});
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(
			socket.sent.some(
				(message) => (message as { type: string }).type === "ping",
			),
		).toBe(true);
		client.close();
		await expect(request).rejects.toThrow("closed");
	});
});
