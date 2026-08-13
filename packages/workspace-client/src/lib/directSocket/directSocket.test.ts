import { afterEach, describe, expect, it } from "bun:test";
import { createDirectSocket, type DirectSocket } from "./directSocket";
import {
	type DirectSocketTelemetryEvent,
	setDirectSocketTelemetry,
} from "./outageReporter";

function makeServer(port = 0) {
	const tokensSeen: string[] = [];
	const server = Bun.serve({
		port,
		fetch(req, srv) {
			const url = new URL(req.url);
			tokensSeen.push(url.searchParams.get("token") ?? "");
			if (srv.upgrade(req)) return;
			return new Response("no", { status: 400 });
		},
		websocket: {
			open(ws) {
				ws.send("hello");
			},
			message() {},
		},
	});
	return { server, tokensSeen, port: server.port };
}

let socket: DirectSocket | null = null;

afterEach(() => {
	socket?.close();
	socket = null;
	setDirectSocketTelemetry(null);
});

function waitFor(condition: () => boolean, timeoutMs = 3_000): Promise<void> {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const timer = setInterval(() => {
			if (condition()) {
				clearInterval(timer);
				resolve();
			} else if (Date.now() - start > timeoutMs) {
				clearInterval(timer);
				reject(new Error("waitFor timeout"));
			}
		}, 20);
	});
}

describe("createDirectSocket", () => {
	it("signs every direct attempt with a fresh token", async () => {
		const { server, tokensSeen, port } = makeServer();
		let tokenVersion = 0;
		socket = createDirectSocket({
			buildUrl: () => `ws://localhost:${port}/events`,
			getToken: () => `tok-${++tokenVersion}`,
			minReconnectionDelay: 20,
			maxReconnectionDelay: 40,
		});
		await waitFor(() => tokensSeen.length >= 1);
		socket.reconnect();
		await waitFor(() => tokensSeen.length >= 2);
		expect(tokensSeen[0]).toBe("tok-1");
		expect(tokensSeen[1]).not.toBe(tokensSeen[0]);
		server.stop(true);
	});

	it("converts an http host URL to ws", async () => {
		const { server, tokensSeen, port } = makeServer();
		socket = createDirectSocket({
			buildUrl: () => `http://localhost:${port}/events`,
			getToken: () => "local-psk",
		});
		await waitFor(() => tokensSeen.length === 1);
		expect(tokensSeen).toEqual(["local-psk"]);
		server.stop(true);
	});

	it("emits degraded once per outage, then recovered", async () => {
		const initial = makeServer();
		const port = initial.port;
		initial.server.stop(true);
		const telemetry: DirectSocketTelemetryEvent[] = [];
		setDirectSocketTelemetry((event) => telemetry.push(event));
		socket = createDirectSocket({
			name: "test-bus",
			buildUrl: () => `ws://localhost:${port}/events`,
			getToken: () => "secret-token",
			minReconnectionDelay: 10,
			maxReconnectionDelay: 20,
		});
		await waitFor(
			() => telemetry.some((event) => event.kind === "degraded"),
			8_000,
		);
		expect(telemetry.filter((event) => event.kind === "degraded")).toHaveLength(
			1,
		);
		expect(telemetry[0]?.endpoint).not.toContain("secret-token");

		const revived = makeServer(port);
		await waitFor(
			() => telemetry.some((event) => event.kind === "recovered"),
			8_000,
		);
		expect(
			telemetry.find((event) => event.kind === "recovered")?.outageMs,
		).not.toBeNull();
		revived.server.stop(true);
	}, 20_000);
});
