import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { AgentBrowserManager } from "./browser-manager";

interface CdpRequest {
	id: number;
	method: string;
	params?: Record<string, unknown>;
	sessionId?: string;
}

interface TargetConnection {
	targetId: string;
	socket: WebSocket;
	pending: CdpRequest[];
}

export interface AgentBrowserCdpProxy {
	baseUrl: string;
	close: () => Promise<void>;
}

function json(
	response: import("node:http").ServerResponse,
	value: unknown,
): void {
	response.writeHead(200, {
		"access-control-allow-origin": "*",
		"content-type": "application/json",
	});
	response.end(JSON.stringify(value));
}

function sessionFromPath(pathname: string, token: string): string | null {
	const prefix = `/${token}/`;
	if (!pathname.startsWith(prefix)) return null;
	const value = pathname.slice(prefix.length).split("/", 1)[0];
	if (!value) return null;
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

async function targetWebSocketUrl(
	upstreamUrl: string,
	targetId: string,
): Promise<string> {
	const response = await fetch(`${upstreamUrl}/json/list`);
	if (!response.ok) throw new Error("Electron CDP target discovery failed");
	const targets = (await response.json()) as Array<{
		id?: string;
		webSocketDebuggerUrl?: string;
	}>;
	const target = targets.find((candidate) => candidate.id === targetId);
	if (!target?.webSocketDebuggerUrl) {
		throw new Error("Agent Browser target is unavailable");
	}
	return target.webSocketDebuggerUrl;
}

export function targetInfoForPage(page: {
	targetId: string;
	url: string;
	title?: string;
}): Record<string, unknown> {
	return {
		targetId: page.targetId,
		type: "page",
		title: page.title ?? "",
		url: page.url,
		attached: false,
		canAccessOpener: false,
	};
}

/**
 * Presents a session-filtered browser-level CDP endpoint to official
 * browser-harness. Target sockets are connected directly to the corresponding
 * Electron WebContents; lifecycle commands remain owned by BrowserManager.
 */
export async function startAgentBrowserCdpProxy(input: {
	manager: AgentBrowserManager;
	upstreamUrl: string;
}): Promise<AgentBrowserCdpProxy> {
	const token = randomBytes(32).toString("hex");
	const server = createServer(async (request, response) => {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		const sessionId = sessionFromPath(url.pathname, token);
		if (!sessionId) {
			response.writeHead(404).end();
			return;
		}
		if (url.pathname.endsWith("/json/version")) {
			await input.manager.ensurePage(sessionId);
			const address = server.address();
			if (!address || typeof address === "string") {
				response.writeHead(503).end();
				return;
			}
			json(response, {
				Browser: "Superset Agent Browser",
				"Protocol-Version": "1.3",
				webSocketDebuggerUrl: `ws://127.0.0.1:${address.port}/${token}/${encodeURIComponent(sessionId)}/devtools/browser`,
			});
			return;
		}
		response.writeHead(404).end();
	});
	const websocketServer = new WebSocketServer({ noServer: true });
	server.on("upgrade", (request, socket, head) => {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		const sessionId = sessionFromPath(url.pathname, token);
		if (!sessionId || !url.pathname.endsWith("/devtools/browser")) {
			socket.destroy();
			return;
		}
		websocketServer.handleUpgrade(request, socket, head, (client) => {
			websocketServer.emit("connection", client, request, sessionId);
		});
	});
	websocketServer.on(
		"connection",
		(client: WebSocket, _request: unknown, sessionId: string) => {
			const targets = new Map<string, TargetConnection>();
			const internalRequests = new Map<number, () => void>();
			const reply = (id: number, result: unknown = {}) => {
				if (client.readyState === WebSocket.OPEN) {
					client.send(JSON.stringify({ id, result }));
				}
			};
			const fail = (id: number, error: unknown) => {
				if (client.readyState === WebSocket.OPEN) {
					client.send(
						JSON.stringify({
							id,
							error: {
								code: -32000,
								message: error instanceof Error ? error.message : String(error),
							},
						}),
					);
				}
			};
			const connectTarget = async (targetId: string, cdpSessionId: string) => {
				const allowed = input.manager.getAllowedTargetIds(sessionId);
				if (!allowed.includes(targetId)) {
					throw new Error("Agent Browser target is not allowed");
				}
				const socket = new WebSocket(
					await targetWebSocketUrl(input.upstreamUrl, targetId),
				);
				const connection: TargetConnection = {
					targetId,
					socket,
					pending: [],
				};
				targets.set(cdpSessionId, connection);
				socket.on("message", (data) => {
					const message = JSON.parse(data.toString()) as Record<
						string,
						unknown
					>;
					if (typeof message.id === "number") {
						const completeInternal = internalRequests.get(message.id);
						if (completeInternal) {
							internalRequests.delete(message.id);
							completeInternal();
							return;
						}
						const original = connection.pending.find(
							(candidate) => candidate.id === message.id,
						);
						connection.pending = connection.pending.filter(
							(candidate) => candidate.id !== message.id,
						);
						if (original) message.id = original.id;
					}
					message.sessionId = cdpSessionId;
					if (client.readyState === WebSocket.OPEN) {
						client.send(JSON.stringify(message));
					}
				});
				await new Promise<void>((resolve, reject) => {
					socket.once("open", () => resolve());
					socket.once("error", reject);
				});
				const state = input.manager.getState(sessionId);
				if (state.activePageIndex === null) return;
				const active = state.pages[state.activePageIndex];
				if (active?.targetId !== targetId || state.pages.length === 0) return;
				// Hidden WebContentsViews report a 0x0 viewport through CDP. Browser
				// harness relies on viewport geometry for coordinate input and images,
				// so emulate a stable viewport until the real companion pane is shown.
				const internalRequestId = Number.MAX_SAFE_INTEGER;
				const viewportApplied = new Promise<void>((resolve) => {
					internalRequests.set(internalRequestId, resolve);
				});
				socket.send(
					JSON.stringify({
						id: internalRequestId,
						method: "Emulation.setDeviceMetricsOverride",
						params: {
							width: 1_280,
							height: 800,
							deviceScaleFactor: 1,
							mobile: false,
						},
					}),
				);
				await viewportApplied;
			};

			client.on("message", (data) => {
				void (async () => {
					const request = JSON.parse(data.toString()) as CdpRequest;
					if (!Number.isInteger(request.id)) return;
					try {
						if (request.method === "Page.captureScreenshot") {
							if (!request.sessionId || !targets.has(request.sessionId)) {
								throw new Error("Agent Browser CDP session is not allowed");
							}
							reply(request.id, {
								data: await input.manager.capturePage(
									sessionId,
									request.params?.captureBeyondViewport === true,
								),
							});
							return;
						}
						if (request.method === "Target.getTargets") {
							const state = input.manager.getState(sessionId);
							const pages = state.pages.toSorted(
								(left, right) => Number(right.active) - Number(left.active),
							);
							reply(request.id, {
								targetInfos: pages.map(targetInfoForPage),
							});
							return;
						}
						if (request.method === "Target.getTargetInfo") {
							const state = input.manager.getState(sessionId);
							const requested = request.params?.targetId;
							const page = state.pages.find(
								(candidate) => candidate.targetId === requested,
							);
							if (!page) throw new Error("Agent Browser target is not allowed");
							reply(request.id, {
								targetInfo: targetInfoForPage(page),
							});
							return;
						}
						if (request.method === "Target.createTarget") {
							const page = await input.manager.createPage(
								sessionId,
								typeof request.params?.url === "string"
									? request.params.url
									: undefined,
							);
							reply(request.id, { targetId: page.targetId });
							return;
						}
						if (
							request.method === "Target.closeTarget" ||
							request.method === "Target.activateTarget"
						) {
							const state = input.manager.getState(sessionId);
							const targetId = request.params?.targetId;
							const page = state.pages.find(
								(candidate) => candidate.targetId === targetId,
							);
							if (!page) throw new Error("Agent Browser target is not allowed");
							if (request.method === "Target.closeTarget") {
								await input.manager.closePage(sessionId, page.id);
							} else {
								await input.manager.selectPage(sessionId, page.id);
							}
							reply(request.id, { success: true });
							return;
						}
						if (request.method === "Target.attachToTarget") {
							const targetId = request.params?.targetId;
							if (typeof targetId !== "string") {
								throw new Error("targetId is required");
							}
							const cdpSessionId = randomUUID();
							await connectTarget(targetId, cdpSessionId);
							reply(request.id, { sessionId: cdpSessionId });
							return;
						}
						if (request.method === "Target.detachFromTarget") {
							const cdpSessionId = request.params?.sessionId;
							if (typeof cdpSessionId === "string") {
								targets.get(cdpSessionId)?.socket.close();
								targets.delete(cdpSessionId);
							}
							reply(request.id);
							return;
						}
						if (
							request.method === "Target.setDiscoverTargets" ||
							request.method === "Target.setAutoAttach"
						) {
							reply(request.id);
							return;
						}
						if (request.method === "Browser.getVersion") {
							reply(request.id, {
								protocolVersion: "1.3",
								product: "Superset Agent Browser",
								revision: "",
								userAgent: "Superset Agent Browser",
								jsVersion: "",
							});
							return;
						}
						const cdpSessionId = request.sessionId;
						const connection = cdpSessionId
							? targets.get(cdpSessionId)
							: undefined;
						if (
							!connection ||
							connection.socket.readyState !== WebSocket.OPEN
						) {
							throw new Error("Agent Browser CDP session is not allowed");
						}
						connection.pending.push(request);
						connection.socket.send(
							JSON.stringify({
								id: request.id,
								method: request.method,
								params: request.params ?? {},
							}),
						);
					} catch (error) {
						fail(request.id, error);
					}
				})();
			});
			client.once("close", () => {
				for (const target of targets.values()) target.socket.close();
				targets.clear();
			});
		},
	);
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Agent Browser CDP proxy failed to bind");
	}
	return {
		baseUrl: `http://127.0.0.1:${address.port}/${token}`,
		close: async () => {
			for (const client of websocketServer.clients) client.terminate();
			websocketServer.close();
			await closeServer(server);
		},
	};
}

async function closeServer(server: Server): Promise<void> {
	if (!server.listening) return;
	server.closeAllConnections();
	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (
				!error ||
				(error as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING"
			) {
				resolve();
				return;
			}
			reject(error);
		});
	});
}
