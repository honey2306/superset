import { randomUUID } from "node:crypto";
import net from "node:net";

type JsonRecord = Record<string, unknown>;

export interface ComputerRuntimeTool {
	name: string;
	description?: string;
	inputSchema: JsonRecord;
	outputSchema?: JsonRecord;
	annotations?: JsonRecord;
	[key: string]: unknown;
}

export interface ComputerRuntimeCatalog {
	capability_version?: string;
	schema_version?: string;
	tools: ComputerRuntimeTool[];
	[key: string]: unknown;
}

export interface ComputerRuntimeToolResult {
	text: string;
	images: Array<{ mimeType: string; dataBase64: string }>;
	structuredJson?: string;
	isError: boolean;
	errorCode?: string;
	degraded: boolean;
	rawJson: string;
	action?: unknown;
	verification?: unknown;
}

export interface ComputerRuntimePermissionState {
	platform: string;
	accessibility: boolean | null;
	screenRecording: boolean | null;
	ready: boolean;
	prompted: boolean;
	relaunchRequired: boolean;
}

export interface ComputerRuntimeLeaseResult<T> {
	generation: number;
	result: T;
}

interface BridgeResponse<T> {
	id: string;
	ok: boolean;
	result?: T;
	error?: string;
}

export interface ComputerRuntimeBridgeClientOptions {
	socketPath?: string;
	token?: string;
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 130_000;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

export class ComputerRuntimeBridgeClient {
	private readonly socketPath: string | undefined;
	private readonly token: string | undefined;
	private readonly timeoutMs: number;

	constructor(options: ComputerRuntimeBridgeClientOptions = {}) {
		this.socketPath =
			options.socketPath ?? process.env.SUPERSET_COMPUTER_RUNTIME_BRIDGE_SOCKET;
		this.token =
			options.token ?? process.env.SUPERSET_COMPUTER_RUNTIME_BRIDGE_TOKEN;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	isAvailable(): boolean {
		return Boolean(this.socketPath && this.token);
	}

	tools(signal?: AbortSignal): Promise<ComputerRuntimeCatalog> {
		return this.call("tools", {}, signal);
	}

	permissions(
		prompt = false,
		signal?: AbortSignal,
	): Promise<ComputerRuntimePermissionState> {
		return this.call("permissions", { prompt }, signal);
	}

	callTool(
		sessionId: string,
		name: string,
		args: JsonRecord,
		signal?: AbortSignal,
	): Promise<ComputerRuntimeLeaseResult<ComputerRuntimeToolResult>> {
		return this.call("callTool", { sessionId, name, arguments: args }, signal);
	}

	async endTurn(sessionId: string): Promise<void> {
		await this.call("endTurn", { sessionId });
	}

	private async call<T>(
		method: string,
		params: JsonRecord,
		signal?: AbortSignal,
	): Promise<T> {
		const socketPath = this.socketPath;
		const token = this.token;
		if (!socketPath || !token) {
			throw new Error("Superset Computer Runtime bridge is unavailable");
		}
		signal?.throwIfAborted();

		return new Promise<T>((resolve, reject) => {
			const id = randomUUID();
			const socket = net.createConnection(socketPath);
			let buffer = "";
			let settled = false;

			const finish = (error?: Error, value?: T) => {
				if (settled) return;
				settled = true;
				signal?.removeEventListener("abort", abort);
				socket.removeAllListeners();
				socket.destroy();
				if (error) reject(error);
				else resolve(value as T);
			};
			const abort = () =>
				finish(new Error("Computer Runtime bridge call cancelled"));

			signal?.addEventListener("abort", abort, { once: true });
			socket.setTimeout(this.timeoutMs, () =>
				finish(new Error("Computer Runtime bridge timed out")),
			);
			socket.setEncoding("utf8");
			socket.once("connect", () => {
				socket.write(`${JSON.stringify({ id, token, method, params })}\n`);
			});
			socket.on("data", (chunk: string) => {
				buffer += chunk;
				if (Buffer.byteLength(buffer) > MAX_RESPONSE_BYTES) {
					finish(new Error("Computer Runtime bridge response too large"));
					return;
				}
				const newline = buffer.indexOf("\n");
				if (newline < 0) return;
				try {
					const response = JSON.parse(
						buffer.slice(0, newline),
					) as BridgeResponse<T>;
					if (response.id !== id) {
						throw new Error("Computer Runtime bridge response id mismatch");
					}
					if (!response.ok) {
						throw new Error(
							response.error ?? "Computer Runtime bridge call failed",
						);
					}
					finish(undefined, response.result);
				} catch (error) {
					finish(error instanceof Error ? error : new Error(String(error)));
				}
			});
			socket.once("error", (error) => finish(error));
			socket.once("close", () =>
				finish(new Error("Computer Runtime bridge closed before responding")),
			);
		});
	}
}
