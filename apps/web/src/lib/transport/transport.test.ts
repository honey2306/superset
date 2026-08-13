import { describe, expect, test } from "bun:test";
import type { RelayEnvelope } from "@superset/session-protocol";
import {
	AutoMateRelayTransport,
	AutoMateTaskClient,
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
	test("carries the phone bearer through push/pull/ack and acks the response", async () => {
		let request: Extract<RelayEnvelope, { kind: "http.request" }> | undefined;
		const acknowledged: string[] = [];
		let releasePull: (() => void) | undefined;
		const requestPushed = new Promise<void>((resolve) => {
			releasePull = resolve;
		});
		const relayTask = async (input: unknown): Promise<unknown> => {
			const operation = input as {
				op: string;
				body?: RelayEnvelope;
				messageId?: string;
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
				return {
					message: {
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
			if (operation.messageId) acknowledged.push(operation.messageId);
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
		expect(acknowledged).toEqual(["response-message"]);
		transport.stop();
	});

	test("waits for hello, unwraps done, and sends requests FIFO", async () => {
		const socket = new FakeTaskSocket();
		const client = new AutoMateTaskClient(
			"wss://relay.test/ws?token=test",
			() => socket,
		);
		const first = client.run({ op: "first" });
		const second = client.run({ op: "second" });

		expect(socket.sent).toEqual([]);
		socket.emit({ type: "hello" });
		expect(socket.sent).toHaveLength(1);
		const firstRequest = JSON.parse(socket.sent[0] ?? "");
		expect(firstRequest).toMatchObject({
			type: "msg",
			payload: { op: "first" },
		});
		socket.emit({
			type: "done",
			request_id: firstRequest.request_id,
			payload: { result: { order: 1 } },
		});
		expect(await first).toEqual({ order: 1 });
		expect(socket.sent).toHaveLength(2);
		const secondRequest = JSON.parse(socket.sent[1] ?? "");
		expect(secondRequest).toMatchObject({
			type: "msg",
			payload: { op: "second" },
		});
		socket.emit({
			type: "done",
			request_id: secondRequest.request_id,
			payload: { result: { order: 2 } },
		});
		expect(await second).toEqual({ order: 2 });
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

	test("heartbeats after hello without interrupting FIFO and clears timers on close", async () => {
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
		expect(JSON.parse(socket.sent[1] ?? "")).toEqual({ type: "ping" });
		socket.emit({ type: "pong" });
		expect(socket.sent).toHaveLength(2);
		socket.emit({
			type: "done",
			request_id: firstRequest.request_id,
			payload: { result: { order: 1 } },
		});
		expect(await first).toEqual({ order: 1 });
		expect(JSON.parse(socket.sent[2] ?? "")).toMatchObject({
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
});
