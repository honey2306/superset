import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import readline from "node:readline";
import type { McpServer } from "@agentclientprotocol/sdk";

const DEFAULT_MCP_PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 120_000;

type JsonRecord = Record<string, unknown>;

export type McpServerProcess = Extract<McpServer, { command: string }>;

export interface McpTool {
	name: string;
	title?: string;
	description?: string;
	inputSchema: object;
}

export interface McpToolResult {
	content?: unknown;
	isError?: boolean;
	[key: string]: unknown;
}

export interface McpClient {
	callTool(
		name: string,
		args: Record<string, unknown>,
		signal?: AbortSignal,
	): Promise<McpToolResult>;
	close(): Promise<void>;
}

export interface StdioMcpClientOptions {
	clientInfo?: { name: string; version: string };
	protocolVersion?: string;
	startupTimeoutMs?: number;
	toolCallTimeoutMs?: number;
	longRunningToolNames?: ReadonlySet<string>;
	cancellationReason?: string;
}

type PendingMcpRequest = {
	resolve: (value: unknown) => void;
	reject: (reason: Error) => void;
	removeAbortListener?: () => void;
	timeout?: ReturnType<typeof setTimeout>;
};

function asRecord(value: unknown): JsonRecord | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function environmentFor(
	overrides: Record<string, string>,
): Record<string, string> {
	const inherited = Object.fromEntries(
		Object.entries(process.env).filter(
			(entry): entry is [string, string] => entry[1] !== undefined,
		),
	);
	return { ...inherited, ...overrides };
}

function serverEnvironment(server: McpServerProcess): Record<string, string> {
	return Object.fromEntries(
		(server.env ?? []).map(({ name, value }) => [name, value]),
	);
}

export function isMcpServerProcess(
	server: McpServer,
): server is McpServerProcess {
	return "command" in server && typeof server.command === "string";
}

/** Minimal JSON-RPC-over-stdio MCP client shared by adapters and MCP proxies. */
export class StdioMcpClient implements McpClient {
	private readonly child: ChildProcessWithoutNullStreams;
	private readonly pending = new Map<number, PendingMcpRequest>();
	private readonly options: Required<
		Omit<StdioMcpClientOptions, "longRunningToolNames">
	> & {
		longRunningToolNames: ReadonlySet<string>;
	};
	private nextId = 1;
	private closed = false;

	constructor(server: McpServerProcess, options: StdioMcpClientOptions = {}) {
		this.options = {
			clientInfo: options.clientInfo ?? {
				name: "superset-mcp-client",
				version: "1",
			},
			protocolVersion: options.protocolVersion ?? DEFAULT_MCP_PROTOCOL_VERSION,
			startupTimeoutMs: options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
			toolCallTimeoutMs:
				options.toolCallTimeoutMs ?? DEFAULT_TOOL_CALL_TIMEOUT_MS,
			longRunningToolNames: options.longRunningToolNames ?? new Set<string>(),
			cancellationReason:
				options.cancellationReason ?? "MCP tool call cancelled",
		};
		this.child = spawn(server.command, server.args, {
			env: environmentFor(serverEnvironment(server)),
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.child.stderr.on("data", () => {
			// Drain diagnostics; MCP stderr must never corrupt the parent protocol.
		});
		readline
			.createInterface({
				input: this.child.stdout,
				crlfDelay: Number.POSITIVE_INFINITY,
			})
			.on("line", (line) => this.handleLine(line));
		this.child.on("error", (error) => {
			this.closed = true;
			this.failPending(error);
		});
		this.child.on("exit", (code, signal) => {
			this.closed = true;
			this.failPending(
				new Error(`MCP server exited (code=${code}, signal=${signal})`),
			);
		});
	}

	async initialize(): Promise<void> {
		await this.request(
			"initialize",
			{
				protocolVersion: this.options.protocolVersion,
				capabilities: {},
				clientInfo: this.options.clientInfo,
			},
			undefined,
			this.options.startupTimeoutMs,
		);
		this.notify("notifications/initialized", {});
	}

	async listTools(): Promise<McpTool[]> {
		const tools: McpTool[] = [];
		let cursor: string | undefined;
		do {
			const result = asRecord(
				await this.request(
					"tools/list",
					cursor ? { cursor } : {},
					undefined,
					this.options.startupTimeoutMs,
				),
			);
			if (!result || !Array.isArray(result.tools)) {
				throw new Error("MCP tools/list returned an invalid result");
			}
			tools.push(
				...result.tools.filter(
					(tool): tool is McpTool =>
						asRecord(tool) !== null && typeof tool.name === "string",
				),
			);
			cursor =
				typeof result.nextCursor === "string" ? result.nextCursor : undefined;
		} while (cursor);
		return tools;
	}

	async callTool(
		name: string,
		args: Record<string, unknown>,
		signal?: AbortSignal,
	): Promise<McpToolResult> {
		const result = await this.request(
			"tools/call",
			{ name, arguments: args },
			signal,
			this.options.longRunningToolNames.has(name)
				? undefined
				: this.options.toolCallTimeoutMs,
		);
		return asRecord(result) ?? { content: result };
	}

	async close(): Promise<void> {
		if (this.child.exitCode !== null || this.child.signalCode !== null) return;
		this.closed = true;
		this.failPending(new Error("MCP client closed"));
		await new Promise<void>((resolve) => {
			let settled = false;
			let forceKill: ReturnType<typeof setTimeout> | undefined;
			let giveUp: ReturnType<typeof setTimeout> | undefined;
			const finish = () => {
				if (settled) return;
				settled = true;
				if (forceKill) clearTimeout(forceKill);
				if (giveUp) clearTimeout(giveUp);
				this.child.off("exit", finish);
				resolve();
			};
			this.child.once("exit", finish);
			this.child.kill();
			forceKill = setTimeout(() => this.child.kill("SIGKILL"), 2_000);
			giveUp = setTimeout(finish, 4_000);
			forceKill.unref();
			giveUp.unref();
		});
	}

	private request(
		method: string,
		params: Record<string, unknown>,
		signal: AbortSignal | undefined,
		timeoutMs: number | undefined,
	): Promise<unknown> {
		if (this.closed) return Promise.reject(new Error("MCP client is closed"));
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const pending: PendingMcpRequest = { resolve, reject };
			if (timeoutMs !== undefined) {
				pending.timeout = setTimeout(() => {
					if (!this.pending.delete(id)) return;
					pending.removeAbortListener?.();
					this.notify("notifications/cancelled", {
						requestId: id,
						reason: `MCP request timed out: ${method}`,
					});
					reject(new Error(`MCP request timed out: ${method}`));
				}, timeoutMs);
				pending.timeout.unref();
			}
			if (signal) {
				const onAbort = () => {
					this.pending.delete(id);
					if (pending.timeout) clearTimeout(pending.timeout);
					this.notify("notifications/cancelled", {
						requestId: id,
						reason: this.options.cancellationReason,
					});
					reject(new Error("MCP request cancelled"));
				};
				if (signal.aborted) {
					onAbort();
					return;
				}
				signal.addEventListener("abort", onAbort, { once: true });
				pending.removeAbortListener = () =>
					signal.removeEventListener("abort", onAbort);
			}
			this.pending.set(id, pending);
			this.write({ jsonrpc: "2.0", id, method, params });
		});
	}

	private notify(method: string, params: Record<string, unknown>): void {
		if (this.closed) return;
		this.write({ jsonrpc: "2.0", method, params });
	}

	private write(message: Record<string, unknown>): void {
		if (!this.child.stdin.destroyed)
			this.child.stdin.write(`${JSON.stringify(message)}\n`);
	}

	private handleLine(line: string): void {
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			return;
		}
		const message = asRecord(value);
		if (
			!message ||
			(typeof message.id !== "number" && typeof message.id !== "string")
		)
			return;
		if (
			typeof message.method === "string" &&
			!Object.hasOwn(message, "result") &&
			!Object.hasOwn(message, "error")
		) {
			this.write(
				message.method === "ping"
					? { jsonrpc: "2.0", id: message.id, result: {} }
					: {
							jsonrpc: "2.0",
							id: message.id,
							error: { code: -32601, message: "Method not found" },
						},
			);
			return;
		}
		if (typeof message.id !== "number") return;
		const pending = this.pending.get(message.id);
		if (!pending) return;
		this.pending.delete(message.id);
		if (pending.timeout) clearTimeout(pending.timeout);
		pending.removeAbortListener?.();
		const error = asRecord(message.error);
		if (error) {
			pending.reject(
				new Error(`MCP error ${String(error.code)}: ${String(error.message)}`),
			);
		} else {
			pending.resolve(message.result);
		}
	}

	private failPending(error: Error): void {
		for (const pending of this.pending.values()) {
			if (pending.timeout) clearTimeout(pending.timeout);
			pending.removeAbortListener?.();
			pending.reject(error);
		}
		this.pending.clear();
	}
}
