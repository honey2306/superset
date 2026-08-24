import { randomUUID } from "node:crypto";
import net from "node:net";
import { createInterface } from "node:readline";
import {
	formatSupersetDelegationInstructions,
	SUPERSET_DELEGATED_EXECUTOR_ROLE,
	SUPERSET_DELEGATION_INSTRUCTIONS,
	SUPERSET_TOOL_DEFINITIONS,
} from "@superset/session-protocol";
import type { AcpDaemonRequest, AcpDaemonResponse } from "./daemon";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const DAEMON_CALL_TIMEOUT_MS = 120_000;
const LONG_RUNNING_TOOL_NAMES = new Set(["ask_user", "wait_delegation"]);
const socketPath = requiredEnv("SUPERSET_ACP_DAEMON_SOCKET_PATH");
const sourceSessionId = requiredEnv("SUPERSET_ACP_SOURCE_SESSION_ID");
const isDelegatedExecutor =
	process.env.SUPERSET_ACP_SESSION_ROLE === SUPERSET_DELEGATED_EXECUTOR_ROLE;

type JsonRpcId = string | number;
interface JsonRpcRequest {
	jsonrpc: "2.0";
	id?: JsonRpcId;
	method: string;
	params?: unknown;
}

/**
 * Claude Agent ACP currently adds this field to its internal representation of
 * an MCP tool whose input object has no properties. It is not part of the MCP
 * schema we advertise, and must not reach the strictly validated daemon tool.
 */
function normalizeToolArguments(name: string, arguments_: unknown): unknown {
	if (
		name !== "open_merge_request" ||
		typeof arguments_ !== "object" ||
		arguments_ === null ||
		Array.isArray(arguments_)
	) {
		return arguments_;
	}
	const entries = Object.entries(arguments_);
	if (
		entries.length === 1 &&
		entries[0]?.[0] === "_noargs" &&
		typeof entries[0][1] === "string"
	) {
		return {};
	}
	return arguments_;
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

async function callDaemon(
	name: string,
	args: unknown,
	signal?: AbortSignal,
	op: "supersetTool" | "getDelegatedExecution" = "supersetTool",
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection(socketPath);
		let buffer = "";
		let settled = false;
		const id = randomUUID();
		const request: AcpDaemonRequest = {
			type: "request",
			id,
			op,
			params:
				op === "getDelegatedExecution"
					? {}
					: {
							sourceSessionId,
							name,
							arguments: args,
						},
		};
		const timeout = LONG_RUNNING_TOOL_NAMES.has(name)
			? undefined
			: setTimeout(() => {
					finish(new Error("Superset daemon tool call timed out"));
				}, DAEMON_CALL_TIMEOUT_MS);
		const finish = (cause?: Error, value?: unknown) => {
			if (settled) return;
			settled = true;
			if (timeout) clearTimeout(timeout);
			signal?.removeEventListener("abort", cancel);
			socket.removeAllListeners();
			socket.destroy();
			if (cause) reject(cause);
			else resolve(value);
		};
		const cancel = () => finish(new Error("Superset tool call cancelled"));
		if (signal?.aborted) {
			cancel();
			return;
		}
		signal?.addEventListener("abort", cancel, { once: true });
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

/**
 * The MCP process is intentionally adapter-agnostic, so it cannot read host
 * settings directly. Ask the daemon for the host setting's current
 * resolution before advertising the model-facing tool surface. This is a
 * host-wide setting, so the query deliberately does not require a published
 * parent runtime. Fail closed: a missing daemon or an invalid target must
 * never make `delegate` visible.
 */
interface DelegationAvailability {
	available: boolean;
	instructions?: string;
}

async function delegatedExecutionAvailability(): Promise<DelegationAvailability> {
	if (isDelegatedExecutor) return { available: false };
	try {
		const delegatedExecution = await callDaemon(
			"get_delegated_execution",
			{},
			undefined,
			"getDelegatedExecution",
		);
		if (typeof delegatedExecution !== "object" || delegatedExecution === null) {
			return { available: false };
		}
		const state = delegatedExecution as {
			enabled?: unknown;
			valid?: unknown;
			profiles?: unknown;
		};
		if (Array.isArray(state.profiles)) {
			const profiles = state.profiles.filter(
				(
					profile,
				): profile is {
					id: string;
					name: string;
					description: string;
					enabled: boolean;
					valid: boolean;
				} =>
					typeof profile === "object" &&
					profile !== null &&
					typeof (profile as { id?: unknown }).id === "string" &&
					typeof (profile as { name?: unknown }).name === "string" &&
					typeof (profile as { description?: unknown }).description ===
						"string" &&
					typeof (profile as { enabled?: unknown }).enabled === "boolean" &&
					typeof (profile as { valid?: unknown }).valid === "boolean",
			);
			const available = profiles.some(
				(profile) => profile.enabled && profile.valid,
			);
			return {
				available,
				...(available
					? {
							instructions: formatSupersetDelegationInstructions(profiles),
						}
					: {}),
			};
		}
		const available = state.enabled === true && state.valid === true;
		return {
			available,
			...(available ? { instructions: SUPERSET_DELEGATION_INSTRUCTIONS } : {}),
		};
	} catch {
		return { available: false };
	}
}

function visibleToolDefinitions(includeDelegate: boolean) {
	return SUPERSET_TOOL_DEFINITIONS.filter((tool) => {
		if (tool.name === "delegate") return includeDelegate;
		if (tool.name === "report_delegation_result") return isDelegatedExecutor;
		// A root coordinator may need to resume waiting for an existing durable
		// run after delegation profiles are disabled or become invalid. Delegated
		// executors cannot own runs and should not see either coordination tool.
		if (tool.name === "wait_delegation") return !isDelegatedExecutor;
		return true;
	});
}

const activeToolCalls = new Map<JsonRpcId, AbortController>();

async function handle(request: JsonRpcRequest): Promise<void> {
	if (request.method === "notifications/cancelled") {
		const requestId = (request.params as { requestId?: JsonRpcId } | undefined)
			?.requestId;
		if (requestId !== undefined) activeToolCalls.get(requestId)?.abort();
		return;
	}
	if (request.id === undefined) return;
	try {
		switch (request.method) {
			case "initialize":
				{
					const availability = await delegatedExecutionAvailability();
					result(request.id, {
						protocolVersion: MCP_PROTOCOL_VERSION,
						// Dynamic profile changes apply to newly initialized MCP clients;
						// this standalone process does not advertise listChanged until a
						// daemon subscription is wired end-to-end.
						capabilities: { tools: {} },
						serverInfo: { name: "superset", version: "1" },
						...(availability.available
							? { instructions: availability.instructions }
							: {}),
					});
				}
				return;
			case "ping":
				result(request.id, {});
				return;
			case "tools/list":
				result(request.id, {
					tools: visibleToolDefinitions(
						(await delegatedExecutionAvailability()).available,
					),
				});
				return;
			case "tools/call": {
				const params = request.params as
					| { name?: unknown; arguments?: unknown }
					| undefined;
				if (typeof params?.name !== "string") {
					error(request.id, -32602, "tools/call requires a tool name");
					return;
				}
				const controller = new AbortController();
				activeToolCalls.set(request.id, controller);
				try {
					const value = await callDaemon(
						params.name,
						normalizeToolArguments(params.name, params.arguments ?? {}),
						controller.signal,
					);
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
				} finally {
					activeToolCalls.delete(request.id);
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
