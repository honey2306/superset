import readline from "node:readline";
import { LAZY_MCP_CONFIG_ENV, type LazyMcpProxyConfig } from "./lazy-mcp";
import { StdioMcpClient } from "./stdio-mcp-client";

type JsonRecord = Record<string, unknown>;
type JsonRpcId = string | number;

function asRecord(value: unknown): JsonRecord | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function parseConfig(environment: NodeJS.ProcessEnv): LazyMcpProxyConfig {
	const serialized = environment[LAZY_MCP_CONFIG_ENV];
	if (!serialized) throw new Error(`Missing ${LAZY_MCP_CONFIG_ENV}`);
	const value: unknown = JSON.parse(serialized);
	const record = asRecord(value);
	const upstream = asRecord(record?.upstream);
	if (
		!record ||
		!upstream ||
		typeof upstream.name !== "string" ||
		typeof upstream.command !== "string" ||
		!Array.isArray(upstream.args) ||
		!Array.isArray(record.tools)
	) {
		throw new Error("Invalid lazy MCP proxy configuration");
	}
	return value as LazyMcpProxyConfig;
}

function writeMessage(message: JsonRecord): void {
	if (!process.stdout.destroyed)
		process.stdout.write(`${JSON.stringify(message)}\n`);
}

function errorMessage(
	id: JsonRpcId,
	code: number,
	message: string,
): JsonRecord {
	return { jsonrpc: "2.0", id, error: { code, message } };
}

export class LazyMcpProxy {
	private client: StdioMcpClient | null = null;
	private clientPromise: Promise<StdioMcpClient> | null = null;
	private readonly activeCalls = new Map<string, AbortController>();
	private closing = false;

	constructor(private readonly config: LazyMcpProxyConfig) {}

	async handleMessage(value: unknown): Promise<void> {
		const message = asRecord(value);
		if (!message || message.jsonrpc !== "2.0") return;
		const method = typeof message.method === "string" ? message.method : null;
		if (!method) return;
		const id =
			typeof message.id === "string" || typeof message.id === "number"
				? message.id
				: null;
		if (id === null) {
			this.handleNotification(method, asRecord(message.params));
			return;
		}
		try {
			const result = await this.handleRequest(
				id,
				method,
				asRecord(message.params),
			);
			writeMessage({ jsonrpc: "2.0", id, result });
		} catch (error) {
			writeMessage(
				errorMessage(
					id,
					-32_000,
					error instanceof Error ? error.message : String(error),
				),
			);
		}
	}

	async close(): Promise<void> {
		if (this.closing) return;
		this.closing = true;
		for (const controller of this.activeCalls.values()) controller.abort();
		this.activeCalls.clear();
		const client = this.client;
		this.client = null;
		this.clientPromise = null;
		if (client) await client.close();
	}

	private async handleRequest(
		id: JsonRpcId,
		method: string,
		params: JsonRecord | null,
	): Promise<unknown> {
		if (method === "initialize") {
			return {
				protocolVersion:
					typeof params?.protocolVersion === "string"
						? params.protocolVersion
						: "2025-06-18",
				capabilities: { tools: {} },
				serverInfo: { name: "superset-lazy-mcp-proxy", version: "1" },
			};
		}
		if (method === "ping") return {};
		if (method === "tools/list") return { tools: this.config.tools };
		if (method !== "tools/call") throw new Error(`Method not found: ${method}`);

		const name = typeof params?.name === "string" ? params.name : null;
		if (!name) throw new Error("tools/call requires a tool name");
		if (!this.config.tools.some((tool) => tool.name === name)) {
			throw new Error(`Unknown lazy MCP tool: ${name}`);
		}
		const args = asRecord(params?.arguments) ?? {};
		const key = String(id);
		const controller = new AbortController();
		this.activeCalls.set(key, controller);
		try {
			const client = await this.getClient();
			return await client.callTool(name, args, controller.signal);
		} finally {
			this.activeCalls.delete(key);
		}
	}

	private handleNotification(method: string, params: JsonRecord | null): void {
		if (method !== "notifications/cancelled") return;
		const requestId = params?.requestId;
		if (typeof requestId !== "string" && typeof requestId !== "number") return;
		this.activeCalls.get(String(requestId))?.abort();
	}

	private getClient(): Promise<StdioMcpClient> {
		if (this.closing) return Promise.reject(new Error("MCP proxy is closing"));
		if (this.clientPromise) return this.clientPromise;
		const client = new StdioMcpClient(this.config.upstream, {
			clientInfo: { name: "superset-lazy-mcp-proxy", version: "1" },
		});
		this.client = client;
		this.clientPromise = (async () => {
			try {
				await client.initialize();
				const upstreamNames = new Set(
					(await client.listTools()).map((tool) => tool.name),
				);
				for (const tool of this.config.tools) {
					if (!upstreamNames.has(tool.name)) {
						throw new Error(
							`Upstream MCP is missing advertised tool: ${tool.name}`,
						);
					}
				}
				return client;
			} catch (error) {
				await client.close();
				if (this.client === client) this.client = null;
				this.clientPromise = null;
				throw error;
			}
		})();
		return this.clientPromise;
	}
}

export async function startLazyMcpProxy(
	environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
	const proxy = new LazyMcpProxy(parseConfig(environment));
	const lines = readline.createInterface({
		input: process.stdin,
		crlfDelay: Number.POSITIVE_INFINITY,
	});
	lines.on("line", (line) => {
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			return;
		}
		void proxy.handleMessage(value);
	});
	lines.once("close", () => void proxy.close());
	const stop = () => {
		void proxy.close().finally(() => process.exit(0));
	};
	process.once("SIGINT", stop);
	process.once("SIGTERM", stop);
}

const invokedPath = process.argv[1] ?? "";
if (
	invokedPath.endsWith("/lazy-mcp-proxy.js") ||
	invokedPath.endsWith("/lazy-mcp-proxy.ts")
) {
	void startLazyMcpProxy().catch((error) => {
		process.stderr.write(
			`[lazy-mcp-proxy] ${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exitCode = 1;
	});
}
