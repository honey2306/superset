import { randomUUID } from "node:crypto";
import net from "node:net";
import { createInterface } from "node:readline";
import { SUPERSET_TOOL_DEFINITIONS } from "@superset/session-protocol";
import type { AcpDaemonRequest, AcpDaemonResponse } from "./daemon";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const DAEMON_CALL_TIMEOUT_MS = 120_000;
const socketPath = requiredEnv("SUPERSET_ACP_DAEMON_SOCKET_PATH");
const sourceSessionId = requiredEnv("SUPERSET_ACP_SOURCE_SESSION_ID");

type JsonRpcId = string | number;
interface JsonRpcRequest {
	jsonrpc: "2.0";
	id?: JsonRpcId;
	method: string;
	params?: unknown;
}

function write(message: unknown): void {
	process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id: JsonRpcId, value: unknown): void {
	write({ jsonrpc: "2.0", id, result: value });
}

function error(id: JsonRpcId, code: number, message: string): void {
	write({ jsonrpc: "2.0", id, error: { code, message } });
}

async function callDaemon(name: string, args: unknown): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection(socketPath);
		let buffer = "";
		let settled = false;
		const id = randomUUID();
		const request: AcpDaemonRequest = {
			type: "request",
			id,
			op: "supersetTool",
			params: {
				sourceSessionId,
				name,
				arguments: args,
			},
		};
		const timeout = setTimeout(() => {
			finish(new Error("Superset daemon tool call timed out"));
		}, DAEMON_CALL_TIMEOUT_MS);
		const finish = (cause?: Error, value?: unknown) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			socket.removeAllListeners();
			socket.destroy();
			if (cause) reject(cause);
			else resolve(value);
		};
		socket.setEncoding("utf8");
		socket.once("connect", () => {
			socket.write(`${JSON.stringify(request)}\n`);
		});
		socket.on("data", (chunk: string) => {
			buffer += chunk;
			for (;;) {
				const newline = buffer.indexOf("\n");
				if (newline < 0) return;
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				if (!line) continue;
				let response: AcpDaemonResponse;
				try {
					response = JSON.parse(line) as AcpDaemonResponse;
				} catch {
					finish(new Error("Superset daemon returned invalid JSON"));
					return;
				}
				if (response.type !== "response" || response.id !== id) continue;
				if (response.ok) finish(undefined, response.result);
				else {
					finish(new Error(response.error?.message ?? "Superset tool failed"));
				}
				return;
			}
		});
		socket.once("error", (cause) => finish(cause));
		socket.once("end", () =>
			finish(new Error("Superset daemon disconnected before responding")),
		);
		socket.once("close", () =>
			finish(new Error("Superset daemon connection closed before responding")),
		);
	});
}

async function handle(request: JsonRpcRequest): Promise<void> {
	if (request.id === undefined) return;
	try {
		switch (request.method) {
			case "initialize":
				result(request.id, {
					protocolVersion: MCP_PROTOCOL_VERSION,
					capabilities: { tools: {} },
					serverInfo: { name: "superset", version: "1" },
				});
				return;
			case "ping":
				result(request.id, {});
				return;
			case "tools/list":
				result(request.id, { tools: SUPERSET_TOOL_DEFINITIONS });
				return;
			case "tools/call": {
				const params = request.params as
					| { name?: unknown; arguments?: unknown }
					| undefined;
				if (typeof params?.name !== "string") {
					error(request.id, -32602, "tools/call requires a tool name");
					return;
				}
				try {
					const value = await callDaemon(params.name, params.arguments ?? {});
					result(request.id, {
						content: [{ type: "text", text: JSON.stringify(value) }],
					});
				} catch (cause) {
					result(request.id, {
						content: [
							{
								type: "text",
								text:
									cause instanceof Error
										? cause.message
										: "Superset tool failed",
							},
						],
						isError: true,
					});
				}
				return;
			}
			default:
				error(request.id, -32601, `Method not found: ${request.method}`);
		}
	} catch (cause) {
		error(
			request.id,
			-32603,
			cause instanceof Error ? cause.message : "Internal MCP error",
		);
	}
}

const lines = createInterface({
	input: process.stdin,
	crlfDelay: Number.POSITIVE_INFINITY,
});
lines.on("line", (line) => {
	if (!line) return;
	let request: JsonRpcRequest;
	try {
		request = JSON.parse(line) as JsonRpcRequest;
	} catch {
		write({
			jsonrpc: "2.0",
			id: null,
			error: { code: -32700, message: "Parse error" },
		});
		return;
	}
	void handle(request);
});

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required by the Superset MCP server`);
	return value;
}
