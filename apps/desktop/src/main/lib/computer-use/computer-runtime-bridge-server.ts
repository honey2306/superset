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
import { ComputerRuntime } from "./computer-runtime";
import { ComputerUseCoordinator } from "./computer-use-coordinator";

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

export interface ComputerRuntimeBridge {
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

function bridgeIdentity(): { socketPath: string; token: string } {
	const home = process.env.SUPERSET_HOME_DIR;
	if (!home) {
		const id = randomBytes(12).toString("hex");
		return {
			socketPath:
				process.platform === "win32"
					? `\\\\.\\pipe\\superset-computer-runtime-${id}`
					: path.join(os.tmpdir(), `superset-computer-runtime-${id}.sock`),
			token: randomBytes(32).toString("hex"),
		};
	}
	mkdirSync(home, { recursive: true });
	const id = createHash("sha256").update(home).digest("hex").slice(0, 16);
	const tokenPath = path.join(home, "computer-runtime-bridge.token");
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
				? `\\\\.\\pipe\\superset-computer-runtime-${id}`
				: path.join(home, "computer-runtime-bridge.sock"),
		token,
	};
}

async function dispatch(
	runtime: ComputerRuntime,
	coordinator: ComputerUseCoordinator,
	request: BridgeRequest,
	signal: AbortSignal,
): Promise<unknown> {
	switch (request.method) {
		case "status":
			return {
				available: await runtime.isAvailable(),
				lease: coordinator.state(),
				permissions: runtime.permissions(false),
				metadata: await runtime.metadata(),
			};
		case "tools":
			return runtime.listTools();
		case "permissions":
			return runtime.permissions(request.params?.prompt === true);
		case "callTool": {
			const sessionId = requiredString(request.params, "sessionId");
			const name = requiredString(request.params, "name");
			const args =
				request.params?.arguments &&
				typeof request.params.arguments === "object" &&
				!Array.isArray(request.params.arguments)
					? (request.params.arguments as Record<string, unknown>)
					: {};
			return coordinator.run(
				sessionId,
				async () => runtime.callTool(sessionId, name, args, signal),
				signal,
			);
		}
		case "endTurn": {
			const sessionId = requiredString(request.params, "sessionId");
			await runtime.endSession(sessionId);
			coordinator.endTurn(sessionId);
			return coordinator.state();
		}
		default:
			throw new Error(
				`Unknown Computer Runtime bridge method: ${request.method}`,
			);
	}
}

/**
 * Electron-owned, authenticated bridge. ACP/MCP subprocesses never instantiate
 * Cua directly; this keeps desktop permissions and runtime ownership in the app.
 */
export async function startComputerRuntimeBridge(): Promise<ComputerRuntimeBridge> {
	const runtime = new ComputerRuntime();
	const coordinator = new ComputerUseCoordinator();
	const { socketPath, token } = bridgeIdentity();
	if (process.platform !== "win32" && existsSync(socketPath)) {
		unlinkSync(socketPath);
	}

	const server = net.createServer((socket) => {
		socket.setEncoding("utf8");
		let buffer = "";
		let activeController: AbortController | null = null;
		socket.on("data", (chunk: string) => {
			buffer += chunk;
			if (Buffer.byteLength(buffer) > 4 * 1024 * 1024) {
				socket.destroy(new Error("Computer Runtime bridge request too large"));
				return;
			}
			const newline = buffer.indexOf("\n");
			if (newline < 0) return;
			const line = buffer.slice(0, newline);
			buffer = buffer.slice(newline + 1);
			if (!line || activeController) return;

			void (async () => {
				let request: BridgeRequest | undefined;
				const controller = new AbortController();
				activeController = controller;
				try {
					request = JSON.parse(line) as BridgeRequest;
					if (!request.id || request.token !== token) {
						throw new Error("Computer Runtime bridge authentication failed");
					}
					const result = await dispatch(
						runtime,
						coordinator,
						request,
						controller.signal,
					);
					if (socket.destroyed) return;
					const response: BridgeResponse = {
						id: request.id,
						ok: true,
						result,
					};
					socket.write(`${JSON.stringify(response)}\n`);
				} catch (error) {
					if (socket.destroyed) return;
					const response: BridgeResponse = {
						id: request?.id ?? "unknown",
						ok: false,
						error: error instanceof Error ? error.message : String(error),
					};
					socket.write(`${JSON.stringify(response)}\n`);
				} finally {
					activeController = null;
				}
			})();
		});
		socket.once("close", () => activeController?.abort());
		socket.on("error", () => activeController?.abort());
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
			coordinator.shutdown();
			await runtime.shutdown();
			await new Promise<void>((resolve) => server.close(() => resolve()));
			if (process.platform !== "win32" && existsSync(socketPath)) {
				unlinkSync(socketPath);
			}
		},
	};
}
