import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@agentclientprotocol/sdk";

export interface ComputerUseMcpServerInput {
	sessionId: string;
	execPath?: string;
	scriptPath?: string;
}

export function resolveComputerUseMcpScriptPath(
	moduleUrl: string = import.meta.url,
): string {
	const here = path.dirname(fileURLToPath(moduleUrl));
	const candidates = [
		path.join(here, "computer-use-mcp.js"),
		path.resolve(here, "..", "computer-use-mcp.js"),
	];
	return candidates.find(existsSync) ?? path.join(here, "computer-use-mcp.js");
}

/** Build the macOS-only, session-scoped Computer Use MCP process. */
export function computerUseMcpServer(
	input: ComputerUseMcpServerInput,
): McpServer {
	return {
		name: "desktop-control",
		command: input.execPath ?? process.execPath,
		args: [input.scriptPath ?? resolveComputerUseMcpScriptPath()],
		env: [
			{ name: "ELECTRON_RUN_AS_NODE", value: "1" },
			{ name: "SUPERSET_ACP_SOURCE_SESSION_ID", value: input.sessionId },
		],
	};
}
