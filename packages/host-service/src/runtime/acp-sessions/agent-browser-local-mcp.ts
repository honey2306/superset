import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@agentclientprotocol/sdk";

export interface AgentBrowserMcpServerInput {
	sessionId: string;
	daemonSocketPath: string;
	execPath?: string;
	scriptPath?: string;
}

export function resolveAgentBrowserMcpScriptPath(
	moduleUrl: string = import.meta.url,
): string {
	const here = path.dirname(fileURLToPath(moduleUrl));
	const candidates = [
		path.join(here, "agent-browser-mcp.js"),
		path.resolve(here, "..", "agent-browser-mcp.js"),
	];
	return candidates.find(existsSync) ?? path.join(here, "agent-browser-mcp.js");
}

/** Build the session-scoped stdio MCP that proxies to the detached browser owner. */
export function agentBrowserMcpServer(
	input: AgentBrowserMcpServerInput,
): McpServer {
	return {
		name: "agent-browser",
		command: input.execPath ?? process.execPath,
		args: [input.scriptPath ?? resolveAgentBrowserMcpScriptPath()],
		env: [
			{ name: "ELECTRON_RUN_AS_NODE", value: "1" },
			{
				name: "SUPERSET_ACP_DAEMON_SOCKET_PATH",
				value: input.daemonSocketPath,
			},
			{
				name: "SUPERSET_ACP_SOURCE_SESSION_ID",
				value: input.sessionId,
			},
		],
	};
}
