import { createHash, randomBytes } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { chmod } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { AgentBrowserManager } from "./browser-manager";

interface BridgeRequest {
	id: string;
	token: string;
	method: string;
	params?: Record<string, unknown>;
}

interface BridgeResponse {
	id: string;
	ok: boolean;
	result?: unknown;
	error?: string;
}

export interface AgentBrowserBridge {
	socketPath: string;
	token: string;
	close: () => Promise<void>;
}

function requiredString(
	params: Record<string, unknown> | undefined,
	name: string,
): string {
	const value = params?.[name];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${name} is required`);
	}
	return value;
}

async function dispatch(
	manager: AgentBrowserManager,
	request: BridgeRequest,
): Promise<unknown> {
	const sessionId = requiredString(request.params, "sessionId");
	switch (request.method) {
		case "state":
			return manager.getState(sessionId);
		case "ensurePage":
			return manager.ensurePage(sessionId);
		case "createPage":
			return manager.createPage(
				sessionId,
				typeof request.params?.url === "string"
					? request.params.url
					: undefined,
			);
		case "selectPage":
			await manager.selectPage(
				sessionId,
				requiredString(request.params, "pageId"),
			);
			return manager.getState(sessionId);
		case "closePage":
			await manager.closePage(
				sessionId,
				requiredString(request.params, "pageId"),
			);
			return manager.getState(sessionId);
		case "closeSession":
			await manager.closeSession(sessionId);
			return null;
		case "navigate":
			await manager.navigate(sessionId, requiredString(request.params, "url"));
			return manager.getState(sessionId);
		case "activeTarget": {
			const active = await manager.ensurePage(sessionId);
			return {
				page: active,
				allowedTargetIds: manager.getAllowedTargetIds(sessionId),
			};
		}
		default:
			throw new Error(`Unknown Agent Browser bridge method: ${request.method}`);
	}
}

function bridgeIdentity(): { socketPath: string; token: string } {
	const home = process.env.SUPERSET_HOME_DIR;
	if (!home) {
		const id = randomBytes(12).toString("hex");
		return {
			socketPath:
				process.platform === "win32"
					? `\\\\.\\pipe\\superset-agent-browser-${id}`
					: path.join(os.tmpdir(), `superset-agent-browser-${id}.sock`),
			token: randomBytes(32).toString("hex"),
		};
	}
	mkdirSync(home, { recursive: true });
	const id = createHash("sha256").update(home).digest("hex").slice(0, 16);
	const tokenPath = path.join(home, "agent-browser-bridge.token");
	let token: string;
	try {
		token = readFileSync(tokenPath, "utf8").trim();
		if (token.length < 32) throw new Error("Invalid bridge token");
	} catch {
		token = randomBytes(32).toString("hex");
		writeFileSync(tokenPath, token, { mode: 0o600 });
	}
	return {
		socketPath:
			process.platform === "win32"
				? `\\\\.\\pipe\\superset-agent-browser-${id}`
				: path.join(home, "agent-browser-bridge.sock"),
		token,
	};
}

/** Start the authenticated local lifecycle bridge used by the ACP daemon. */
export async function startAgentBrowserBridge(
	manager: AgentBrowserManager,
): Promise<AgentBrowserBridge> {
	const { socketPath, token } = bridgeIdentity();
	if (process.platform !== "win32" && existsSync(socketPath)) {
		unlinkSync(socketPath);
	}
	const server = net.createServer((socket) => {
		socket.setEncoding("utf8");
		let buffer = "";
		socket.on("data", (chunk: string) => {
			buffer += chunk;
			if (Buffer.byteLength(buffer) > 1024 * 1024) {
				socket.destroy(new Error("Agent Browser bridge request too large"));
				return;
			}
			for (;;) {
				const newline = buffer.indexOf("\n");
				if (newline < 0) return;
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				if (!line) continue;
				void (async () => {
					let request: BridgeRequest | undefined;
					try {
						request = JSON.parse(line) as BridgeRequest;
						if (!request.id || request.token !== token) {
							throw new Error("Agent Browser bridge authentication failed");
						}
						const result = await dispatch(manager, request);
						const response: BridgeResponse = {
							id: request.id,
							ok: true,
							result,
						};
						socket.write(`${JSON.stringify(response)}\n`);
					} catch (error) {
						const response: BridgeResponse = {
							id: request?.id ?? "unknown",
							ok: false,
							error: error instanceof Error ? error.message : String(error),
						};
						socket.write(`${JSON.stringify(response)}\n`);
					}
				})();
			}
		});
		socket.on("error", () => {});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(socketPath, () => {
			server.off("error", reject);
			resolve();
		});
	});
	if (process.platform !== "win32") await chmod(socketPath, 0o600);
	return {
		socketPath,
		token,
		close: async () => {
			await new Promise<void>((resolve) => server.close(() => resolve()));
			if (process.platform !== "win32" && existsSync(socketPath)) {
				unlinkSync(socketPath);
			}
		},
	};
}
