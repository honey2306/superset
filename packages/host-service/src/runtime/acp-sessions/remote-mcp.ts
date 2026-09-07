import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@agentclientprotocol/sdk";
import type { HarnessKind } from "@superset/session-protocol";

type RemoteMcpServer = Extract<McpServer, { type: "http" | "sse" }>;

export interface RemoteMcpProxyOptions {
	execPath?: string;
	scriptPath?: string;
}

export function resolveRemoteMcpProxyScriptPath(
	moduleUrl: string = import.meta.url,
): string {
	const here = path.dirname(fileURLToPath(moduleUrl));
	const candidates = [
		path.join(here, "remote-mcp-proxy.js"),
		path.resolve(here, "..", "remote-mcp-proxy.js"),
		path.join(here, "remote-mcp-proxy.ts"),
	];
	return candidates.find(existsSync) ?? path.join(here, "remote-mcp-proxy.js");
}

export function remoteMcpProxyServer(
	server: RemoteMcpServer,
	options: RemoteMcpProxyOptions = {},
): McpServer {
	return {
		name: server.name,
		command: options.execPath ?? process.execPath,
		args: [
			options.scriptPath ?? resolveRemoteMcpProxyScriptPath(),
			server.url,
			"--transport",
			server.type === "http" ? "http-only" : "sse-only",
			...server.headers.flatMap(({ name, value }) => [
				"--header",
				`${name}:${value}`,
			]),
		],
		env: [{ name: "ELECTRON_RUN_AS_NODE", value: "1" }],
	};
}

/** Claude advertises native remote MCP support; bundled adapters currently do not. */
export function prepareRemoteMcpServersForHarness(
	servers: readonly McpServer[],
	harness: HarnessKind,
	options: RemoteMcpProxyOptions = {},
): McpServer[] {
	if (harness === "claude-agent-acp") return [...servers];
	return servers.map((server) =>
		"type" in server && (server.type === "http" || server.type === "sse")
			? remoteMcpProxyServer(server, options)
			: server,
	);
}
