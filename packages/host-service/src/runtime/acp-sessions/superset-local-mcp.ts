import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@agentclientprotocol/sdk";
import type { SupersetSessionRole } from "@superset/session-protocol";

export interface SupersetMcpServerInput {
	sessionId: string;
	daemonSocketPath: string;
	role?: SupersetSessionRole;
	execPath?: string;
	scriptPath?: string;
}

export function resolveSupersetMcpScriptPath(
	moduleUrl: string = import.meta.url,
): string {
	const here = path.dirname(fileURLToPath(moduleUrl));
	const candidates = [
		path.join(here, "superset-mcp.js"),
		path.resolve(here, "..", "superset-mcp.js"),
	];
	return candidates.find(existsSync) ?? path.join(here, "superset-mcp.js");
}

/** Build a session-scoped stdio MCP declaration for Superset orchestration. */
export function supersetMcpServer(input: SupersetMcpServerInput): McpServer {
	return {
		name: "superset",
		command: input.execPath ?? process.execPath,
		args: [input.scriptPath ?? resolveSupersetMcpScriptPath()],
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
			...(input.role
				? [{ name: "SUPERSET_ACP_SESSION_ROLE", value: input.role }]
				: []),
		],
	};
}
