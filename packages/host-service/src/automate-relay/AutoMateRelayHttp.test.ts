import { describe, expect, test } from "bun:test";
import {
	AutoMateRelayHttpTaskClient,
	createDefaultAutoMateRelayTaskClient,
	toAutoMateRunRequest,
} from "./AutoMateRelayHttp";

describe("AutoMateRelayHttpTaskClient", () => {
	test("converts the websocket task URL to a token-free /run URL", () => {
		expect(
			toAutoMateRunRequest(
				"wss://relay.example/res/task/16739/ws?token=task-secret&ignored=query",
			),
		).toEqual({
			url: "https://relay.example/res/task/16739/run",
			token: "task-secret",
		});
	});

	test("rejects relay paths that do not end in the websocket endpoint", () => {
		expect(() =>
			toAutoMateRunRequest(
				"wss://relay.example/res/task/16739/not-ws?token=task-secret",
			),
		).toThrow("path must end in /ws");
	});

	test("posts task input with the task token in a header and unwraps data", async () => {
		let requestUrl: string | undefined;
		let requestInit: RequestInit | undefined;
		const client = new AutoMateRelayHttpTaskClient(
			"wss://relay.example/res/task/16739/ws?token=task-secret",
			async (input, init) => {
				requestUrl = String(input);
				requestInit = init;
				return new Response(
					JSON.stringify({ code: 0, data: { ok: true }, msg: "" }),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			},
		);

		expect(await client.request({ op: "pull" })).toEqual({ ok: true });
		expect(requestUrl).toBe("https://relay.example/res/task/16739/run");
		expect(new Headers(requestInit?.headers).get("x-am-task-token")).toBe(
			"task-secret",
		);
		expect(new Headers(requestInit?.headers).get("content-type")).toBe(
			"application/json",
		);
		expect(requestInit?.method).toBe("POST");
		expect(requestInit?.body).toBe(JSON.stringify({ op: "pull" }));
	});

	test("redacts the task token from relay business errors", async () => {
		const token = "task-secret";
		const client = new AutoMateRelayHttpTaskClient(
			`wss://relay.example/res/task/16739/ws?token=${token}`,
			async () =>
				new Response(
					JSON.stringify({
						code: 401,
						data: null,
						msg: `invalid token ${token}`,
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
		);

		const failure = client.request({ op: "health" });
		await expect(failure).rejects.toThrow("invalid token [redacted]");
		await expect(failure).rejects.not.toThrow(token);
	});

	test("retries transient HTTP and invalid-JSON responses with safe diagnostics", async () => {
		const token = "task-secret";
		let calls = 0;
		const client = new AutoMateRelayHttpTaskClient(
			`wss://relay.example/res/task/16739/ws?token=${token}`,
			async () => {
				calls += 1;
				if (calls === 1) {
					return new Response(`<html>token=${token}</html>`, {
						status: 502,
						headers: { "content-type": "text/html" },
					});
				}
				return new Response("not-json-body", {
					status: 200,
					headers: { "content-type": "text/plain" },
				});
			},
			{
				maxRetries: 1,
				sleep: async () => {},
			},
		);

		const failure = client.request({ op: "pull", mailboxId: "private-box" });
		await expect(failure).rejects.toThrow(
			/status=200.*content-type=text\/plain.*response=text/,
		);
		await expect(failure).rejects.not.toThrow(token);
		await expect(failure).rejects.not.toThrow("not-json-body");
		expect(calls).toBe(2);
	});

	test("aborts hung attempts and stops after the retry budget", async () => {
		let calls = 0;
		let aborts = 0;
		const client = new AutoMateRelayHttpTaskClient(
			"wss://relay.example/res/task/16739/ws?token=task-secret",
			async (_input, init) => {
				calls += 1;
				return new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => {
						aborts += 1;
						reject(new DOMException("aborted", "AbortError"));
					});
				});
			},
			{
				requestTimeoutMs: 1,
				maxRetries: 1,
				sleep: async () => {},
			},
		);

		await expect(client.request({ op: "pull" })).rejects.toThrow(
			/timeout|timed out/i,
		);
		expect(calls).toBe(2);
		expect(aborts).toBe(2);
	});

	test("bounds response body reads with the per-attempt timeout", async () => {
		let aborts = 0;
		const client = new AutoMateRelayHttpTaskClient(
			"wss://relay.example/res/task/16739/ws?token=task-secret",
			async (_input, init) => {
				init?.signal?.addEventListener("abort", () => {
					aborts += 1;
				});
				return {
					status: 200,
					ok: true,
					headers: new Headers({ "content-type": "application/json" }),
					text: () =>
						new Promise<string>((_resolve, reject) => {
							init?.signal?.addEventListener("abort", () => {
								reject(new DOMException("aborted", "AbortError"));
							});
						}),
				} as unknown as Response;
			},
			{
				requestTimeoutMs: 1,
				maxRetries: 0,
				sleep: async () => {},
			},
		);

		await expect(client.request({ op: "pull" })).rejects.toThrow(/timed out/i);
		expect(aborts).toBe(1);
	});

	test("releases a request whose response body is still reading when closed", async () => {
		let bodyReadStarted = false;
		const client = new AutoMateRelayHttpTaskClient(
			"wss://relay.example/res/task/16739/ws?token=task-secret",
			async (_input, init) =>
				({
					status: 200,
					ok: true,
					headers: new Headers({ "content-type": "application/json" }),
					text: () => {
						bodyReadStarted = true;
						return new Promise<string>((_resolve, reject) => {
							init?.signal?.addEventListener("abort", () => {
								reject(new DOMException("aborted", "AbortError"));
							});
						});
					},
				}) as unknown as Response,
			{
				requestTimeoutMs: 10_000,
				maxRetries: 0,
				sleep: async () => {},
			},
		);

		const request = client.request({ op: "pull" });
		for (let attempt = 0; attempt < 10 && !bodyReadStarted; attempt += 1)
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(bodyReadStarted).toBe(true);
		client.close();
		await expect(request).rejects.toThrow("closed");
	});

	test("does not leave a retry sleeping after the client is closed", async () => {
		let resolveRetrySleep: (() => void) | undefined;
		let retrySleepStarted = false;
		const retrySleep = new Promise<void>((resolve) => {
			resolveRetrySleep = resolve;
		});
		const client = new AutoMateRelayHttpTaskClient(
			"wss://relay.example/res/task/16739/ws?token=task-secret",
			async () =>
				new Response("temporary", {
					status: 503,
					headers: { "content-type": "text/plain" },
				}),
			{
				maxRetries: 1,
				sleep: async () => {
					retrySleepStarted = true;
					return retrySleep;
				},
			},
		);

		const request = client.request({ op: "push" });
		for (let attempt = 0; attempt < 10 && !retrySleepStarted; attempt += 1)
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(retrySleepStarted).toBe(true);
		client.close();
		await expect(request).rejects.toThrow("closed");
		resolveRetrySleep?.();
	});

	test("bounds concurrent HTTP task requests", async () => {
		let active = 0;
		let peak = 0;
		const releases: Array<() => void> = [];
		const client = new AutoMateRelayHttpTaskClient(
			"wss://relay.example/res/task/16739/ws?token=task-secret",
			async () => {
				active += 1;
				peak = Math.max(peak, active);
				await new Promise<void>((resolve) => releases.push(resolve));
				active -= 1;
				return new Response(JSON.stringify({ code: 0, data: "ok" }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
			{
				maxConcurrentRequests: 2,
				sleep: async () => {},
			},
		);

		const requests = [
			client.request({ op: "one" }),
			client.request({ op: "two" }),
			client.request({ op: "three" }),
		];
		await Promise.resolve();
		expect(peak).toBe(2);
		expect(releases).toHaveLength(2);
		releases.splice(0, 2).forEach((release) => {
			release();
		});
		for (let attempt = 0; attempt < 10 && releases.length < 1; attempt += 1)
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(peak).toBe(2);
		expect(releases).toHaveLength(1);
		releases.splice(0, 1).forEach((release) => {
			release();
		});
		await expect(Promise.all(requests)).resolves.toEqual(["ok", "ok", "ok"]);
	});

	test("default factory uses the HTTP task client", () => {
		expect(
			createDefaultAutoMateRelayTaskClient(
				"wss://relay.example/res/task/16739/ws?token=task-secret",
			),
		).toBeInstanceOf(AutoMateRelayHttpTaskClient);
	});
});
