import { expect, test } from "bun:test";
import { hostFetch } from "./request";

test("a host that never replies has a bounded wait and warns against duplicate sends", async () => {
	const server = Bun.serve({
		port: 0,
		fetch: () => new Promise<Response>(() => {}),
	});
	try {
		await expect(hostFetch(server.url, undefined, 25)).rejects.toThrow(
			"不要重复发送",
		);
	} finally {
		await server.stop(true);
	}
});

test("preserves caller cancellation", async () => {
	const controller = new AbortController();
	controller.abort(new Error("caller cancelled"));
	await expect(
		hostFetch("http://127.0.0.1:1", { signal: controller.signal }),
	).rejects.toThrow("caller cancelled");
});

test("successful requests retain headers and response body", async () => {
	const server = Bun.serve({
		port: 0,
		fetch: (request) => new Response(request.headers.get("x-test")),
	});
	try {
		const response = await hostFetch(server.url, {
			headers: { "x-test": "ok" },
		});
		expect(await response.text()).toBe("ok");
	} finally {
		await server.stop(true);
	}
});
