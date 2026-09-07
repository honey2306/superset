import { afterEach, describe, expect, test } from "bun:test";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { AgentBrowserManager } from "./browser-manager";
import { startAgentBrowserCdpProxy } from "./cdp-proxy";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	await Promise.allSettled(cleanups.splice(0).map((cleanup) => cleanup()));
});

function fakeManager() {
	const calls: string[] = [];
	const pages = [
		{
			id: "page-1",
			index: 0,
			targetId: "target-1",
			url: "https://allowed.example",
			title: "Allowed",
			active: true,
			canGoBack: false,
			canGoForward: false,
			loading: false,
		},
	];
	return {
		calls,
		manager: {
			ensurePage: async () => pages[0],
			getState: () => ({
				enabled: true as const,
				active: true,
				pages,
				activePageIndex: 0,
			}),
			getAllowedTargetIds: () => pages.map((page) => page.targetId),
			createPage: async (_sessionId: string, url?: string) => {
				calls.push(`create:${url}`);
				return { ...pages[0], id: "page-2", targetId: "target-2" };
			},
			closePage: async (_sessionId: string, pageId: string) => {
				calls.push(`close:${pageId}`);
			},
			selectPage: async (_sessionId: string, pageId: string) => {
				calls.push(`select:${pageId}`);
			},
			capturePage: async (_sessionId: string, fullPage: boolean) => {
				calls.push(`capture:${fullPage}`);
				return "cG5n";
			},
		} as unknown as AgentBrowserManager,
	};
}

async function upstream() {
	const server = createServer((request, response) => {
		if (request.url === "/json/list") {
			const address = server.address();
			if (!address || typeof address === "string")
				throw new Error("no address");
			response.writeHead(200, {
				"access-control-allow-origin": "*",
				"content-type": "application/json",
			});
			response.end(
				JSON.stringify([
					{
						id: "target-1",
						webSocketDebuggerUrl: `ws://127.0.0.1:${address.port}/page/target-1`,
					},
				]),
			);
			return;
		}
		response.writeHead(404).end();
	});
	const websocketServer = new WebSocketServer({ noServer: true });
	server.on("upgrade", (request, socket, head) => {
		websocketServer.handleUpgrade(request, socket, head, (client) => {
			websocketServer.emit("connection", client, request);
		});
	});
	websocketServer.on("connection", (client) => {
		client.on("message", (data) => {
			const request = JSON.parse(data.toString()) as {
				id: number;
				method: string;
			};
			client.send(
				JSON.stringify({ id: request.id, result: { echoed: request.method } }),
			);
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("no address");
	cleanups.push(
		async () =>
			await new Promise<void>((resolve) => {
				for (const client of websocketServer.clients) client.terminate();
				websocketServer.close();
				server.closeAllConnections();
				server.close(() => resolve());
			}),
	);
	return `http://127.0.0.1:${address.port}`;
}

async function connect(url: string): Promise<WebSocket> {
	const socket = new WebSocket(url);
	await new Promise<void>((resolve, reject) => {
		socket.once("open", resolve);
		socket.once("error", reject);
	});
	return socket;
}

async function request(
	socket: WebSocket,
	message: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const response = new Promise<Record<string, unknown>>((resolve) => {
		socket.once("message", (data) => resolve(JSON.parse(data.toString())));
	});
	socket.send(JSON.stringify(message));
	return response;
}

describe("Agent Browser CDP proxy", () => {
	test("publishes a session endpoint and only its allowlisted targets", async () => {
		const { manager } = fakeManager();
		const proxy = await startAgentBrowserCdpProxy({
			manager,
			upstreamUrl: await upstream(),
		});
		cleanups.push(proxy.close);
		const version = (await fetch(
			`${proxy.baseUrl}/session-1/json/version`,
		).then((response) => response.json())) as {
			webSocketDebuggerUrl: string;
		};
		const socket = await connect(version.webSocketDebuggerUrl);
		const targets = await request(socket, {
			id: 1,
			method: "Target.getTargets",
		});
		expect(targets).toMatchObject({
			result: {
				targetInfos: [{ targetId: "target-1", url: "https://allowed.example" }],
			},
		});
		socket.terminate();
	});

	test("routes lifecycle through Electron and forwards attached page commands", async () => {
		const { manager, calls } = fakeManager();
		const proxy = await startAgentBrowserCdpProxy({
			manager,
			upstreamUrl: await upstream(),
		});
		cleanups.push(proxy.close);
		const version = (await fetch(
			`${proxy.baseUrl}/session-1/json/version`,
		).then((response) => response.json())) as {
			webSocketDebuggerUrl: string;
		};
		const socket = await connect(version.webSocketDebuggerUrl);

		const attached = await request(socket, {
			id: 1,
			method: "Target.attachToTarget",
			params: { targetId: "target-1", flatten: true },
		});
		const sessionId = (attached.result as { sessionId: string }).sessionId;
		expect(
			await request(socket, {
				id: 2,
				sessionId,
				method: "Runtime.evaluate",
				params: { expression: "document.title" },
			}),
		).toMatchObject({
			id: 2,
			sessionId,
			result: { echoed: "Runtime.evaluate" },
		});
		expect(
			await request(socket, {
				id: 20,
				sessionId,
				method: "Page.captureScreenshot",
				params: { captureBeyondViewport: true },
			}),
		).toMatchObject({ id: 20, result: { data: "cG5n" } });
		await request(socket, {
			id: 3,
			method: "Target.createTarget",
			params: { url: "about:blank" },
		});
		await request(socket, {
			id: 4,
			method: "Target.closeTarget",
			params: { targetId: "target-1" },
		});
		expect(calls).toEqual([
			"capture:true",
			"create:about:blank",
			"close:page-1",
		]);

		const denied = await request(socket, {
			id: 5,
			method: "Target.attachToTarget",
			params: { targetId: "other-session-target", flatten: true },
		});
		expect(denied).toMatchObject({
			error: { message: "Agent Browser target is not allowed" },
		});
		socket.terminate();
	});
});
