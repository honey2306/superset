import { describe, expect, test } from "bun:test";
import {
	AUTOMATE_BROWSER_RELAY_MAX_CONCURRENT_REQUESTS,
	AUTOMATE_BROWSER_RELAY_PATH,
	AutoMateBrowserRelayClient,
	toAutoMateBrowserRelayUrl,
} from "./browser-relay-client";

function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: Error) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});
	return { promise, resolve, reject };
}

describe("toAutoMateBrowserRelayUrl", () => {
	test("resolves a same-origin relative WebApp proxy path", () => {
		expect(
			toAutoMateBrowserRelayUrl(
				AUTOMATE_BROWSER_RELAY_PATH,
				"https://automate.example",
			),
		).toBe("https://automate.example/api/task/16740/run");
	});

	test("rejects a direct task 16739 endpoint", () => {
		expect(() =>
			toAutoMateBrowserRelayUrl(
				"/res/task/16739/run",
				"https://automate.example",
			),
		).toThrow("must use AutoMate WebApp task 16740's relay proxy");
	});

	test("rejects cross-origin and credentialed proxy URLs", () => {
		expect(() =>
			toAutoMateBrowserRelayUrl(
				"https://other.example/api/task/16740/run",
				"https://automate.example",
			),
		).toThrow("same-origin");
		expect(() =>
			toAutoMateBrowserRelayUrl(
				"/api/task/16740/run?token=task-secret",
				"https://automate.example",
			),
		).toThrow("must not contain credentials or query data");
	});
});

describe("AutoMateBrowserRelayClient", () => {
	test("uses a conservative default concurrency budget", () => {
		expect(AUTOMATE_BROWSER_RELAY_MAX_CONCURRENT_REQUESTS).toBe(2);
	});

	test("bounds in-flight requests and drains queued work in order", async () => {
		const responses: Array<ReturnType<typeof deferred<Response>>> = [];
		const calls: number[] = [];
		let active = 0;
		let maxActive = 0;
		const client = new AutoMateBrowserRelayClient(
			AUTOMATE_BROWSER_RELAY_PATH,
			async (_input, init) => {
				const body = JSON.parse(String(init?.body)) as {
					relay: { id: number };
				};
				calls.push(body.relay.id);
				const request = deferred<Response>();
				responses.push(request);
				active += 1;
				maxActive = Math.max(maxActive, active);
				return request.promise.finally(() => {
					active -= 1;
				});
			},
			"https://automate.example",
			{ maxConcurrentRequests: 2 },
		);

		const pending = [1, 2, 3, 4].map((id) => client.run({ id }));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(responses).toHaveLength(2);
		expect(maxActive).toBe(2);
		responses[0]?.resolve(
			new Response(JSON.stringify({ code: 0, data: { id: 1 } })),
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(responses).toHaveLength(3);
		expect(calls).toEqual([1, 2, 3]);

		responses[1]?.resolve(
			new Response(JSON.stringify({ code: 0, data: { id: 2 } })),
		);
		responses[2]?.resolve(
			new Response(JSON.stringify({ code: 0, data: { id: 3 } })),
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(responses).toHaveLength(4);
		expect(calls).toEqual([1, 2, 3, 4]);
		responses[3]?.resolve(
			new Response(JSON.stringify({ code: 0, data: { id: 4 } })),
		);

		expect(await Promise.all(pending)).toEqual([
			{ id: 1 },
			{ id: 2 },
			{ id: 3 },
			{ id: 4 },
		]);
	});

	test("drains queued work after an active request rejects", async () => {
		const responses: Array<ReturnType<typeof deferred<Response>>> = [];
		const calls: number[] = [];
		const client = new AutoMateBrowserRelayClient(
			AUTOMATE_BROWSER_RELAY_PATH,
			async (_input, init) => {
				const body = JSON.parse(String(init?.body)) as {
					relay: { id: number };
				};
				calls.push(body.relay.id);
				const response = deferred<Response>();
				responses.push(response);
				return response.promise;
			},
			"https://automate.example",
			{ maxConcurrentRequests: 1, maxRetries: 0 },
		);

		const first = client.run({ id: 1 });
		const second = client.run({ id: 2 });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(calls).toEqual([1]);

		responses[0]?.reject(new Error("network"));
		await expect(first).rejects.toThrow("request failed");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(calls).toEqual([1, 2]);

		responses[1]?.resolve(
			new Response(JSON.stringify({ code: 0, data: { id: 2 } })),
		);
		await expect(second).resolves.toEqual({ id: 2 });
	});

	test("retries transient network failures with the exact same relay payload", async () => {
		const bodies: string[] = [];
		let attempts = 0;
		const client = new AutoMateBrowserRelayClient(
			AUTOMATE_BROWSER_RELAY_PATH,
			async (_input, init) => {
				bodies.push(String(init?.body));
				attempts += 1;
				if (attempts < 3) throw new Error("network disconnected");
				return new Response(JSON.stringify({ code: 0, data: { ok: true } }));
			},
			"https://automate.example",
			{ maxRetries: 2, retryBaseDelayMs: 0 },
		);

		await expect(
			client.run({ messageId: "message-1", input: "hello" }),
		).resolves.toEqual({ ok: true });
		expect(attempts).toBe(3);
		expect(new Set(bodies)).toEqual(
			new Set([
				JSON.stringify({
					type: "api",
					relay: { messageId: "message-1", input: "hello" },
				}),
			]),
		);
	});

	test("retries invalid JSON responses", async () => {
		let attempts = 0;
		const client = new AutoMateBrowserRelayClient(
			AUTOMATE_BROWSER_RELAY_PATH,
			async () => {
				attempts += 1;
				if (attempts === 1) return new Response("not-json");
				return new Response(JSON.stringify({ code: 0, data: "recovered" }));
			},
			"https://automate.example",
			{ maxRetries: 1, retryBaseDelayMs: 0 },
		);

		await expect(client.run({ op: "pull" })).resolves.toBe("recovered");
		expect(attempts).toBe(2);
	});

	test("stops after the configured transient retry budget", async () => {
		let attempts = 0;
		const client = new AutoMateBrowserRelayClient(
			AUTOMATE_BROWSER_RELAY_PATH,
			async () => {
				attempts += 1;
				return new Response(JSON.stringify({ msg: "still unavailable" }), {
					status: 503,
				});
			},
			"https://automate.example",
			{ maxRetries: 2, retryBaseDelayMs: 0 },
		);

		await expect(
			client.run({ messageId: "message-2", input: "retry" }),
		).rejects.toThrow("request failed");
		expect(attempts).toBe(3);
	});

	test("retries HTTP 429 and 5xx responses but not ordinary 4xx or business errors", async () => {
		for (const status of [429, 500]) {
			let attempts = 0;
			const client = new AutoMateBrowserRelayClient(
				AUTOMATE_BROWSER_RELAY_PATH,
				async () => {
					attempts += 1;
					return attempts === 1
						? new Response(JSON.stringify({ msg: "try again" }), { status })
						: new Response(JSON.stringify({ code: 0, data: { status } }));
				},
				"https://automate.example",
				{ maxRetries: 1, retryBaseDelayMs: 0 },
			);

			await expect(client.run({ op: "transient", status })).resolves.toEqual({
				status,
			});
			expect(attempts).toBe(2);
		}

		let ordinaryClientCalls = 0;
		const ordinaryClient = new AutoMateBrowserRelayClient(
			AUTOMATE_BROWSER_RELAY_PATH,
			async () => {
				ordinaryClientCalls += 1;
				return new Response(JSON.stringify({ code: 400, msg: "bad request" }), {
					status: 400,
				});
			},
			"https://automate.example",
			{ maxRetries: 2, retryBaseDelayMs: 0 },
		);
		await expect(ordinaryClient.run({ op: "bad" })).rejects.toThrow(
			"request failed",
		);
		expect(ordinaryClientCalls).toBe(1);

		let businessClientCalls = 0;
		const businessClient = new AutoMateBrowserRelayClient(
			AUTOMATE_BROWSER_RELAY_PATH,
			async () => {
				businessClientCalls += 1;
				return new Response(
					JSON.stringify({ code: 409, msg: "operation rejected" }),
				);
			},
			"https://automate.example",
			{ maxRetries: 2, retryBaseDelayMs: 0 },
		);
		await expect(businessClient.run({ op: "conflict" })).rejects.toThrow(
			"operation rejected",
		);
		expect(businessClientCalls).toBe(1);
	});

	test("uses exponential retry backoff and closes a sleeping retry immediately", async () => {
		const timers = new Map<
			number,
			{ callback: () => void; timeoutMs: number }
		>();
		let nextTimer = 0;
		let attempts = 0;
		const scheduler = {
			setTimeout: (callback: () => void, timeoutMs: number) => {
				const timer = nextTimer++;
				timers.set(timer, { callback, timeoutMs });
				return timer;
			},
			clearTimeout: (timer: unknown) => {
				if (typeof timer === "number") timers.delete(timer);
			},
		};
		const client = new AutoMateBrowserRelayClient(
			AUTOMATE_BROWSER_RELAY_PATH,
			async () => {
				attempts += 1;
				return new Response(JSON.stringify({ msg: "busy" }), { status: 503 });
			},
			"https://automate.example",
			{
				maxRetries: 2,
				retryBaseDelayMs: 10,
				retryMaxDelayMs: 100,
				scheduler,
			},
		);

		const pending = client.run({ op: "pull" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(attempts).toBe(1);
		const firstRetry = [...timers.entries()].find(
			([, timer]) => timer.timeoutMs === 10,
		);
		expect(firstRetry).toBeDefined();
		firstRetry?.[1].callback();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(attempts).toBe(2);
		const secondRetry = [...timers.entries()].find(
			([, timer]) => timer.timeoutMs === 20,
		);
		expect(secondRetry).toBeDefined();

		client.close();
		await expect(pending).rejects.toThrow("client closed");
		expect(timers.size).toBe(0);
		expect(attempts).toBe(2);
	});

	test("drains queued work after a request timeout", async () => {
		const timers = new Map<number, () => void>();
		let nextTimer = 0;
		const responses: Array<ReturnType<typeof deferred<Response>>> = [];
		const calls: number[] = [];
		const client = new AutoMateBrowserRelayClient(
			AUTOMATE_BROWSER_RELAY_PATH,
			async (_input, init) => {
				const body = JSON.parse(String(init?.body)) as {
					relay: { id: number };
				};
				calls.push(body.relay.id);
				const response = deferred<Response>();
				responses.push(response);
				init?.signal?.addEventListener("abort", () =>
					response.reject(new Error("aborted")),
				);
				return response.promise;
			},
			"https://automate.example",
			{
				maxConcurrentRequests: 1,
				requestTimeoutMs: 1,
				scheduler: {
					setTimeout: (callback) => {
						const timer = nextTimer++;
						timers.set(timer, callback);
						return timer;
					},
					clearTimeout: (timer) => {
						timers.delete(timer as number);
					},
				},
			},
		);

		const first = client.run({ id: 1 });
		const second = client.run({ id: 2 });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(calls).toEqual([1]);
		timers.values().next().value?.();
		await expect(first).rejects.toThrow("timed out");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(calls).toEqual([1, 2]);

		responses[1]?.resolve(
			new Response(JSON.stringify({ code: 0, data: { id: 2 } })),
		);
		await expect(second).resolves.toEqual({ id: 2 });
	});

	test("rejects queued work on close and aborts active work", async () => {
		let signal: AbortSignal | undefined;
		const activeRequest = deferred<Response>();
		const client = new AutoMateBrowserRelayClient(
			AUTOMATE_BROWSER_RELAY_PATH,
			async (_input, init) => {
				signal = init?.signal;
				return activeRequest.promise;
			},
			"https://automate.example",
			{ maxConcurrentRequests: 1 },
		);
		const active = client.run({ id: "active" });
		const queued = client.run({ id: "queued" });
		await Promise.resolve();

		client.close();

		await expect(queued).rejects.toThrow("client closed");
		await expect(active).rejects.toThrow("client closed");
		expect(signal?.aborted).toBe(true);
		activeRequest.reject(new Error("aborted"));
	});

	test("rejects when the WebApp proxy fetch never settles", async () => {
		const timeouts = new Map<number, () => void>();
		let nextTimer = 0;
		const client = new AutoMateBrowserRelayClient(
			AUTOMATE_BROWSER_RELAY_PATH,
			async () => new Promise<Response>(() => {}),
			"https://automate.example",
			{
				requestTimeoutMs: 1,
				scheduler: {
					setTimeout: (callback) => {
						const timer = nextTimer++;
						timeouts.set(timer, callback);
						return timer;
					},
					clearTimeout: (timer) => {
						timeouts.delete(timer as number);
					},
				},
			},
		);

		const pending = client.run({ op: "pull" });
		await Promise.resolve();
		expect(timeouts).toHaveLength(1);
		const callback = timeouts.values().next().value as (() => void) | undefined;
		callback?.();

		await expect(pending).rejects.toThrow("timed out");
		expect(timeouts).toHaveLength(0);
	});

	test("sends only the mailbox operation to the proxy", async () => {
		let requestUrl: string | undefined;
		let requestInit: RequestInit | undefined;
		const client = new AutoMateBrowserRelayClient(
			AUTOMATE_BROWSER_RELAY_PATH,
			async (input, init) => {
				requestUrl = String(input);
				requestInit = init;
				return new Response(JSON.stringify({ code: 0, data: { ok: true } }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
			"https://automate.example",
		);

		expect(await client.run({ op: "pull", mailboxId: "mailbox" })).toEqual({
			ok: true,
		});
		expect(requestUrl).toBe("https://automate.example/api/task/16740/run");
		expect(requestInit?.method).toBe("POST");
		expect(requestInit?.credentials).toBe("same-origin");
		expect(requestInit?.body).toBe(
			JSON.stringify({
				type: "api",
				relay: { op: "pull", mailboxId: "mailbox" },
			}),
		);
		const headers = new Headers(requestInit?.headers);
		expect(headers.get("content-type")).toBe("application/json");
		expect(headers.has("x-am-task-token")).toBe(false);
	});

	test("rejects proxy failures and prevents calls after close", async () => {
		const client = new AutoMateBrowserRelayClient(
			AUTOMATE_BROWSER_RELAY_PATH,
			async () =>
				new Response(JSON.stringify({ code: 401, msg: "not authorized" }), {
					status: 200,
				}),
			"https://automate.example",
		);
		await expect(client.run({ op: "pull" })).rejects.toThrow("not authorized");
		client.close();
		await expect(client.run({ op: "pull" })).rejects.toThrow("client closed");
	});
});
