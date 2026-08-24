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

	test("default factory uses the HTTP task client", () => {
		expect(
			createDefaultAutoMateRelayTaskClient(
				"wss://relay.example/res/task/16739/ws?token=task-secret",
			),
		).toBeInstanceOf(AutoMateRelayHttpTaskClient);
	});
});
