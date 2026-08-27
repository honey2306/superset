import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@agentclientprotocol/sdk";
import type { McpServerProcess, McpTool } from "./stdio-mcp-client";

export const LAZY_MCP_CONFIG_ENV = "SUPERSET_LAZY_MCP_CONFIG";

export interface LazyMcpProxyConfig {
	upstream: McpServerProcess;
	tools: McpTool[];
}

export interface LazyMcpWrapOptions {
	execPath?: string;
	scriptPath?: string;
}

export function resolveLazyMcpProxyScriptPath(
	moduleUrl: string = import.meta.url,
): string {
	const here = path.dirname(fileURLToPath(moduleUrl));
	const candidates = [
		path.join(here, "lazy-mcp-proxy.js"),
		path.resolve(here, "..", "lazy-mcp-proxy.js"),
		path.join(here, "lazy-mcp-proxy.ts"),
	];
	return candidates.find(existsSync) ?? path.join(here, "lazy-mcp-proxy.js");
}

/**
 * Replace a stdio MCP declaration with a lightweight manifest-backed proxy.
 * The upstream declaration stays in the child environment rather than argv so
 * credentials are not exposed through the process table.
 */
export function wrapMcpServerForLazyStartup(
	server: McpServerProcess,
	tools: readonly McpTool[],
	options: LazyMcpWrapOptions = {},
): McpServer {
	if (server.env.some(({ name }) => name === LAZY_MCP_CONFIG_ENV))
		return server;
	const config: LazyMcpProxyConfig = {
		upstream: server,
		tools: tools.map((tool) => structuredClone(tool)),
	};
	return {
		name: server.name,
		command: options.execPath ?? process.execPath,
		args: [options.scriptPath ?? resolveLazyMcpProxyScriptPath()],
		env: [
			{ name: "ELECTRON_RUN_AS_NODE", value: "1" },
			{ name: LAZY_MCP_CONFIG_ENV, value: JSON.stringify(config) },
		],
	};
}
