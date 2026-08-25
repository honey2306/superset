import { describe, expect, test } from "bun:test";
import type { RelayEnvelope } from "@superset/session-protocol";
import type { RelaySocket } from "./AutoMateRelay";
import {
	AutoMateRelay,
	AutoMateRelayTaskClient,
	EMPTY_RELAY_PULL_DELAY_MS,
	isAllowedPath,
} from "./AutoMateRelay";

class FakeRelaySocket {
	readyState = 1;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	sent: unknown[] = [];
	send(data: string | ArrayBuffer | Uint8Array): void {
		this.sent.push(JSON.parse(String(data)));
	}
	close(): void {
		this.onclose?.();
	}
	emit(message: unknown): void {
		this.onmessage?.({ data: JSON.stringify(message) });
	}
}

class FakeStreamSocket {
	readyState = 1;
	binaryType: "blob" | "arraybuffer" | "nodebuffer" = "blob";
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: ((event?: { code?: number; reason?: string }) => void) | null = null;
	onerror: (() => void) | null = null;
	sent: unknown[] = [];
	close(code?: number, reason?: string): void {
		this.onclose?.({ code, reason });
	}
	send(data: string | ArrayBuffer | Uint8Array): void {
		this.sent.push(data);
	}
	emit(data: unknown): void {
		this.onmessage?.({ data });
	}
}

async function nextTurn(): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("AutoMateRelay", () => {
	test("uses a QPS-safe empty-mailbox poll delay", async () => {
		let relay: AutoMateRelay;
		let sleptFor: number | undefined;
		relay = new AutoMateRelay("box", {
			client: { request: async () => ({ message: undefined }) },
			fetch: async () => new Response(),
			baseUrl: "http://127.0.0.1:4879",
			sleep: async (ms) => {
				sleptFor = ms;
				relay.stop();
			},
		});
		relay.start();
		await nextTurn();
		expect(sleptFor).toBe(EMPTY_RELAY_PULL_DELAY_MS);
		expect(sleptFor).toBe(500);
	});

	test("rejects paths outside tRPC and ACP streams", () => {
		expect(isAllowedPath("/trpc/phone.pairing.redeem")).toBe(true);
		expect(isAllowedPath("/trpc/acpSessions.get?input=encoded")).toBe(true);
		expect(isAllowedPath("/trpc/terminalAgents.listByWorkspace")).toBe(true);
		expect(isAllowedPath("/trpc/terminalAgents.getOrCreate")).toBe(true);
		expect(isAllowedPath("/trpc/terminal.listSessions")).toBe(true);
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

	test("serializes s2c push envelopes", async () => {
		let releaseFirstPush: (() => void) | undefined;
		const firstPush = new Promise<void>((resolve) => {
			releaseFirstPush = resolve;
		});
		const pushes: unknown[] = [];
		const relay = new AutoMateRelay("box", {
			client: {
				request: async (input) => {
					if ((input as { op: string }).op !== "push") return { ok: true };
					pushes.push(input);
					if (pushes.length === 1) await firstPush;
					return { ok: true };
				},
			},
			fetch: async () => new Response(),
			baseUrl: "http://127.0.0.1:4879",
		});
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		const first = relay["push"]({
			kind: "stream.open",
			channelId: "first",
			path: "/terminal/first",
			headers: {},
		});
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		const second = relay["push"]({
			kind: "stream.close",
			channelId: "first",
		});
		await nextTurn();
		expect(pushes).toHaveLength(1);
		releaseFirstPush?.();
		await Promise.all([first, second]);
		expect(pushes).toHaveLength(2);
	});

	test("batches reply frames after pushing the first frame immediately", async () => {
		let releaseFirstPush: (() => void) | undefined;
		const firstPush = new Promise<void>((resolve) => {
			releaseFirstPush = resolve;
		});
		const pushes: Array<{ body?: RelayEnvelope }> = [];
		const relay = new AutoMateRelay("box", {
			client: {
				request: async (input) => {
					if ((input as { op: string }).op !== "push") return { ok: true };
					pushes.push(input as { body?: RelayEnvelope });
					if (pushes.length === 1) await firstPush;
					return { ok: true };
				},
			},
			fetch: async () => new Response(),
			baseUrl: "http://127.0.0.1:4879",
		});
		const frame = (data: string) => ({
			kind: "stream.frame" as const,
			channelId: "channel-1",
			body: { type: "text" as const, data },
		});

		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		relay["enqueueStreamPush"](frame("first"));
		await nextTurn();
		expect(pushes).toHaveLength(1);
		expect(pushes[0]?.body).toEqual({
			kind: "stream.frames",
			frames: [
				{ channelId: "channel-1", body: { type: "text", data: "first" } },
			],
		});

		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		relay["enqueueStreamPush"](frame("second"));
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		relay["enqueueStreamPush"](frame("third"));
		releaseFirstPush?.();
		await nextTurn();

		expect(pushes).toHaveLength(2);
		expect(pushes[1]?.body).toEqual({
			kind: "stream.frames",
			frames: [
				{ channelId: "channel-1", body: { type: "text", data: "second" } },
				{ channelId: "channel-1", body: { type: "text", data: "third" } },
			],
		});
	});

	test("keeps buffered reply frames ahead of http responses and stream closes", async () => {
		let releaseFirstPush: (() => void) | undefined;
		const firstPush = new Promise<void>((resolve) => {
			releaseFirstPush = resolve;
		});
		const pushedBodies: RelayEnvelope[] = [];
		const relay = new AutoMateRelay("box", {
			client: {
				request: async (input) => {
					const operation = input as { op: string; body?: RelayEnvelope };
					if (operation.op !== "push" || !operation.body) return { ok: true };
					pushedBodies.push(operation.body);
					if (pushedBodies.length === 1) await firstPush;
					return { ok: true };
				},
			},
			fetch: async () => new Response(),
			baseUrl: "http://127.0.0.1:4879",
		});
		const frame = (data: string) => ({
			kind: "stream.frame" as const,
			channelId: "channel-1",
			body: { type: "text" as const, data },
		});
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		relay["enqueueStreamPush"](frame("first"));
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		relay["enqueueStreamPush"](frame("second"));
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		const response = relay["push"]({
			kind: "http.response",
			requestId: "request-1",
			status: 200,
			headers: {},
		});
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		relay["enqueueStreamPush"]({
			kind: "stream.close",
			channelId: "channel-1",
		});

		releaseFirstPush?.();
		await response;
		await nextTurn();
		expect(pushedBodies.map((body) => body.kind)).toEqual([
			"stream.frames",
			"stream.frames",
			"http.response",
			"stream.close",
		]);
	});

	test("rejects queued outbound work when stopped", async () => {
		let releaseFirstPush: (() => void) | undefined;
		const firstPush = new Promise<void>((resolve) => {
			releaseFirstPush = resolve;
		});
		const relay = new AutoMateRelay("box", {
			client: {
				request: async (input) => {
					if ((input as { op: string }).op === "push") await firstPush;
					return { ok: true };
				},
			},
			fetch: async () => new Response(),
			baseUrl: "http://127.0.0.1:4879",
		});
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		void relay["push"]({
			kind: "stream.open",
			channelId: "first",
			path: "/terminal/first",
			headers: {},
		});
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		const queued = relay["push"]({
			kind: "stream.close",
			channelId: "first",
		});

		relay.stop();
		await expect(queued).rejects.toThrow("AutoMate relay stopped");
		releaseFirstPush?.();
	});

	test("forwards an allowlisted tRPC GET query without a request body", async () => {
		let forwardedUrl: URL | undefined;
		let forwarded: RequestInit | undefined;
		const pushed: unknown[] = [];
		const relay = new AutoMateRelay("box", {
			client: {
				request: async (input) => {
					pushed.push(input);
					return { ok: true };
				},
			},
			fetch: async (url, init) => {
				forwardedUrl = url instanceof URL ? url : new URL(url.toString());
				forwarded = init;
				return new Response('{"result":{"data":"ok"}}', {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
			baseUrl: "http://127.0.0.1:4879",
		});
		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		await relay["forward"]({
			kind: "http.request",
			requestId: "snapshot",
			path: "/trpc/workspaceCatalog.snapshot?input=encoded",
			method: "GET",
			headers: { authorization: "Bearer phone-token" },
		});

		expect(forwardedUrl?.toString()).toBe(
			"http://127.0.0.1:4879/trpc/workspaceCatalog.snapshot?input=encoded",
		);
		expect(forwarded?.method).toBe("GET");
		expect(forwarded?.body).toBeUndefined();
		expect(new Headers(forwarded?.headers).get("authorization")).toBe(
			"Bearer phone-token",
		);
		expect(pushed).toContainEqual(
			expect.objectContaining({
				op: "push",
				mailboxId: "box",
				direction: "s2c",
				body: {
					kind: "http.response",
					requestId: "snapshot",
					status: 200,
					headers: { "content-type": "application/json" },
					body: "eyJyZXN1bHQiOnsiZGF0YSI6Im9rIn19",
				},
			}),
		);
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
		const acknowledgements: unknown[] = [];
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
							message: { seq: 17, messageId: "message-1", body: request },
						};
					}
					if (operation.op === "push") {
						pushCount += 1;
						return { ok: true };
					}
					ackCount += 1;
					acknowledgements.push(input);
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
		for (const acknowledgement of acknowledgements) {
			expect(acknowledgement).toEqual({
				op: "ack",
				mailboxId: "box",
				direction: "c2s",
				seq: 17,
			});
			expect(acknowledgement).not.toHaveProperty("messageId");
		}
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
								seq: 23,
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
		} as unknown as RelaySocket);

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
		} as unknown as RelaySocket);
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

	test("sets host binary mode and preserves Blob and ArrayBuffer frames", async () => {
		const pushes: Array<{ body?: RelayEnvelope }> = [];
		let socket: FakeStreamSocket | undefined;
		const relay = new AutoMateRelay("box", {
			client: {
				request: async (input) => {
					if ((input as { op: string }).op === "push") {
						pushes.push(input as { body?: RelayEnvelope });
					}
					return { ok: true };
				},
			},
			fetch: async () => new Response("unused"),
			baseUrl: "http://127.0.0.1:4879",
			createWebSocket: () => {
				socket = new FakeStreamSocket();
				return socket;
			},
		});

		// biome-ignore lint/complexity/useLiteralKeys: intentional private test seam
		await relay["openStream"]({
			kind: "stream.open",
			channelId: "channel-blob",
			path: "/terminal/terminal-1",
			headers: {},
		});
		if (!socket) throw new Error("Expected a stream socket");
		expect(socket.binaryType).toBe("arraybuffer");

		socket.emit(new Blob([Uint8Array.from([0, 255, 1])]));
		socket.emit(Uint8Array.from([2, 254, 3]).buffer);

		for (let attempt = 0; attempt < 20 && pushes.length < 2; attempt += 1) {
			await nextTurn();
		}
		expect(pushes.map((push) => push.body)).toEqual([
			{
				kind: "stream.frames",
				frames: [
					{
						channelId: "channel-blob",
						body: {
							type: "binary",
							data: Buffer.from([0, 255, 1]).toString("base64"),
						},
					},
				],
			},
			{
				kind: "stream.frames",
				frames: [
					{
						channelId: "channel-blob",
						body: {
							type: "binary",
							data: Buffer.from([2, 254, 3]).toString("base64"),
						},
					},
				],
			},
		]);
		relay.stop();
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
								seq: 29,
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
		const acknowledgement = requests.find(
			(request) => (request as { op?: string }).op === "ack",
		);
		expect(acknowledgement).toEqual({
			op: "ack",
			mailboxId: "box",
			direction: "c2s",
			seq: 29,
		});
		expect(acknowledgement).not.toHaveProperty("messageId");
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

	test("sends a request while an earlier pull remains unresolved", async () => {
		const socket = new FakeRelaySocket();
		const client = new AutoMateRelayTaskClient(
			"wss://relay.example/ws",
			() => socket,
		);
		const pull = client.request({ op: "pull" });
		const push = client.request({ op: "push" });
		await nextTurn();
		socket.emit({ type: "hello" });
		await nextTurn();
		expect(socket.sent).toHaveLength(2);
		const pullMessage = socket.sent[0] as { request_id: string };
		const pushMessage = socket.sent[1] as { request_id: string };
		socket.emit({
			type: "done",
			request_id: pushMessage.request_id,
			payload: { result: "push" },
		});
		expect(await push).toBe("push");
		socket.emit({
			type: "done",
			request_id: pullMessage.request_id,
			payload: { result: "pull" },
		});
		expect(await pull).toBe("pull");
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

	test("rejects all active work for an uncorrelated task error", async () => {
		const socket = new FakeRelaySocket();
		const client = new AutoMateRelayTaskClient(
			"wss://relay.example/ws",
			() => socket,
		);
		const pull = client.request({ op: "pull" });
		const push = client.request({ op: "push" });
		await nextTurn();
		socket.emit({ type: "hello" });
		await nextTurn();
		socket.emit({ type: "error", payload: { message: "task failed" } });
		await expect(pull).rejects.toThrow("error: task failed");
		await expect(push).rejects.toThrow("error: task failed");
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
