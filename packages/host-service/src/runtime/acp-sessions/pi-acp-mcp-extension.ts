import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import readline from "node:readline";

// Shared with the host-owned ACP manager. Kept local so this standalone,
// externally loaded extension does not pull host-service code into its bundle.
const PI_ACP_MCP_CONFIG_ENV = "SUPERSET_PI_ACP_MCP_CONFIG";
const MCP_PROTOCOL_VERSION = "2025-06-18";
const MCP_REQUEST_TIMEOUT_MS = 90_000;
const MCP_TOOL_CALL_TIMEOUT_MS = 120_000;
const LONG_RUNNING_TOOL_NAMES = new Set(["ask_user", "wait_delegation"]);

interface SessionMcpConfig {
	mcpServers: Record<
		string,
		{
			command: string;
			args: string[];
			env: Record<string, string>;
		}
	>;
}

interface McpTool {
	name: string;
	title?: string;
	description?: string;
	inputSchema: object;
}

interface McpToolResult {
	content?: unknown;
	isError?: boolean;
	[key: string]: unknown;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: number | string;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (reason: Error) => void;
	removeAbortListener?: () => void;
	timeout?: ReturnType<typeof setTimeout>;
}

interface StdioMcpClientOptions {
	toolCallTimeoutMs?: number;
}

interface PiToolResultContent {
	type: "text" | "image";
	text?: string;
	data?: string;
	mimeType?: string;
}

export interface PiExtensionApi {
	registerTool(tool: {
		name: string;
		label: string;
		description: string;
		parameters: object;
		execute(
			toolCallId: string,
			params: Record<string, unknown>,
			signal?: AbortSignal,
		): Promise<{
			content: PiToolResultContent[];
			details: Record<string, unknown>;
			isError?: boolean;
		}>;
	}): void;
	on(event: "session_shutdown", handler: () => Promise<void>): void;
}

function processEnvironment(
	overrides: Record<string, string>,
): Record<string, string> {
	const inherited = Object.fromEntries(
		Object.entries(process.env).filter(
			(entry): entry is [string, string] => entry[1] !== undefined,
		),
	);
	return { ...inherited, ...overrides };
}

export class StdioMcpClient {
	private readonly child: ChildProcessWithoutNullStreams;
	private readonly pending = new Map<number, PendingRequest>();
	private readonly toolCallTimeoutMs: number;
	private nextId = 1;
	private closed = false;

	constructor(
		server: SessionMcpConfig["mcpServers"][string],
		options: StdioMcpClientOptions = {},
	) {
		this.toolCallTimeoutMs =
			options.toolCallTimeoutMs ?? MCP_TOOL_CALL_TIMEOUT_MS;
		this.child = spawn(server.command, server.args, {
			env: processEnvironment(server.env),
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.child.stderr.on("data", () => {
			// Drain server diagnostics without mixing protocol output into ACP stdio.
		});
		readline
			.createInterface({
				input: this.child.stdout,
				crlfDelay: Number.POSITIVE_INFINITY,
			})
			.on("line", (line) => this.handleLine(line));
		this.child.on("error", (error) => this.failPending(error));
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
				protocolVersion: MCP_PROTOCOL_VERSION,
				capabilities: {},
				clientInfo: { name: "superset-pi-acp", version: "1" },
			},
			undefined,
			MCP_REQUEST_TIMEOUT_MS,
		);
		this.notify("notifications/initialized", {});
	}

	async listTools(): Promise<McpTool[]> {
		const tools: McpTool[] = [];
		let cursor: string | undefined;
		do {
			const result = await this.request(
				"tools/list",
				cursor ? { cursor } : {},
				undefined,
				MCP_REQUEST_TIMEOUT_MS,
			);
			if (
				typeof result !== "object" ||
				result === null ||
				!("tools" in result) ||
				!Array.isArray(result.tools)
			) {
				throw new Error("MCP tools/list returned an invalid result");
			}
			tools.push(...(result.tools as McpTool[]));
			cursor =
				"nextCursor" in result && typeof result.nextCursor === "string"
					? result.nextCursor
					: undefined;
		} while (cursor);
		return tools;
	}

	async callTool(
		name: string,
		args: Record<string, unknown>,
		signal?: AbortSignal,
	): Promise<McpToolResult> {
		return (await this.request(
			"tools/call",
			{ name, arguments: args },
			signal,
			LONG_RUNNING_TOOL_NAMES.has(name) ? undefined : this.toolCallTimeoutMs,
		)) as McpToolResult;
	}

	async close(): Promise<void> {
		if (this.child.exitCode !== null || this.child.signalCode !== null) return;
		this.closed = true;
		this.failPending(new Error("MCP client closed"));
		await new Promise<void>((resolve) => {
			let settled = false;
			let forceKill: ReturnType<typeof setTimeout>;
			let giveUp: ReturnType<typeof setTimeout>;
			const finish = () => {
				if (settled) return;
				settled = true;
				clearTimeout(forceKill);
				clearTimeout(giveUp);
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
		signal?: AbortSignal,
		timeoutMs?: number,
	): Promise<unknown> {
		if (this.closed) return Promise.reject(new Error("MCP client is closed"));
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const pending: PendingRequest = { resolve, reject };
			if (timeoutMs !== undefined) {
				const timeout = setTimeout(() => {
					if (!this.pending.delete(id)) return;
					pending.removeAbortListener?.();
					this.notify("notifications/cancelled", {
						requestId: id,
						reason: `MCP request timed out: ${method}`,
					});
					reject(new Error(`MCP request timed out: ${method}`));
				}, timeoutMs);
				timeout.unref();
				pending.timeout = timeout;
			}
			if (signal) {
				const onAbort = () => {
					this.pending.delete(id);
					if (pending.timeout) clearTimeout(pending.timeout);
					this.notify("notifications/cancelled", {
						requestId: id,
						reason: "Pi tool call cancelled",
					});
					reject(new Error("MCP request cancelled"));
				};
				if (signal.aborted) return onAbort();
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
		this.child.stdin.write(`${JSON.stringify(message)}\n`);
	}

	private handleLine(line: string): void {
		let message: unknown;
		try {
			message = JSON.parse(line);
		} catch {
			return;
		}
		if (typeof message !== "object" || message === null || !("id" in message)) {
			return;
		}
		if (typeof message.id !== "number" && typeof message.id !== "string")
			return;
		if (
			"method" in message &&
			typeof message.method === "string" &&
			!("result" in message) &&
			!("error" in message)
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
		const response = message as JsonRpcResponse;
		const pending = this.pending.get(message.id);
		if (!pending) return;
		this.pending.delete(message.id);
		if (pending.timeout) clearTimeout(pending.timeout);
		pending.removeAbortListener?.();
		if (response.error) {
			pending.reject(
				new Error(
					`MCP error ${response.error.code}: ${response.error.message}`,
				),
			);
		} else {
			pending.resolve(response.result);
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

function readSessionConfig(): SessionMcpConfig {
	const configPath = process.env[PI_ACP_MCP_CONFIG_ENV];
	if (!configPath) {
		throw new Error(`Missing ${PI_ACP_MCP_CONFIG_ENV} for Superset Pi ACP`);
	}
	try {
		const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			!("mcpServers" in parsed) ||
			typeof parsed.mcpServers !== "object" ||
			parsed.mcpServers === null
		) {
			throw new Error("Invalid Superset Pi ACP MCP configuration");
		}
		return parsed as SessionMcpConfig;
	} finally {
		try {
			unlinkSync(configPath);
		} catch {
			// Manager cleanup remains the fallback when startup races or fails.
		}
	}
}

function resultContent(content: unknown): PiToolResultContent[] {
	if (!Array.isArray(content)) {
		return [{ type: "text", text: JSON.stringify(content) }];
	}
	return content.map((item): PiToolResultContent => {
		if (typeof item !== "object" || item === null || !("type" in item)) {
			return { type: "text", text: JSON.stringify(item) };
		}
		if (
			item.type === "image" &&
			"data" in item &&
			typeof item.data === "string" &&
			"mimeType" in item &&
			typeof item.mimeType === "string"
		) {
			return { type: "image", data: item.data, mimeType: item.mimeType };
		}
		if (
			item.type === "text" &&
			"text" in item &&
			typeof item.text === "string"
		) {
			return { type: "text", text: item.text };
		}
		return { type: "text", text: JSON.stringify(item) };
	});
}

export default async function supersetAcpMcpExtension(
	pi: PiExtensionApi,
): Promise<void> {
	const config = readSessionConfig();
	const clients: StdioMcpClient[] = [];
	const registeredNames = new Set<string>();

	try {
		for (const [serverName, server] of Object.entries(config.mcpServers)) {
			const client = new StdioMcpClient(server);
			clients.push(client);
			await client.initialize();
			for (const tool of await client.listTools()) {
				if (registeredNames.has(tool.name)) {
					throw new Error(`Duplicate ACP MCP tool name: ${tool.name}`);
				}
				registeredNames.add(tool.name);
				pi.registerTool({
					name: tool.name,
					label: tool.title ?? tool.name,
					description: tool.description ?? `${serverName} MCP tool`,
					parameters: tool.inputSchema,
					async execute(_toolCallId, params, signal) {
						const result = await client.callTool(tool.name, params, signal);
						return {
							content: resultContent(result.content),
							details: { mcpResult: result },
							isError: result.isError === true,
						};
					},
				});
			}
		}
	} catch (error) {
		await Promise.allSettled(clients.map((client) => client.close()));
		throw error;
	}

	pi.on("session_shutdown", async () => {
		await Promise.allSettled(clients.map((client) => client.close()));
	});
}
