import { describe, expect, test } from "bun:test";
import {
	AUTOMATE_BROWSER_RELAY_PATH,
	AutoMateBrowserRelayClient,
	toAutoMateBrowserRelayUrl,
} from "./browser-relay-client";

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
