import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@agentclientprotocol/sdk";

export interface ComputerUseMcpServerInput {
	sessionId: string;
	bridgeSocketPath?: string;
	bridgeToken?: string;
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

/** Build the cross-platform, session-scoped Superset Computer Use MCP process. */
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
			...((input.bridgeSocketPath ??
			process.env.SUPERSET_COMPUTER_RUNTIME_BRIDGE_SOCKET)
				? [
						{
							name: "SUPERSET_COMPUTER_RUNTIME_BRIDGE_SOCKET",
							value:
								input.bridgeSocketPath ??
								process.env.SUPERSET_COMPUTER_RUNTIME_BRIDGE_SOCKET ??
								"",
						},
					]
				: []),
			...((input.bridgeToken ??
			process.env.SUPERSET_COMPUTER_RUNTIME_BRIDGE_TOKEN)
				? [
						{
							name: "SUPERSET_COMPUTER_RUNTIME_BRIDGE_TOKEN",
							value:
								input.bridgeToken ??
								process.env.SUPERSET_COMPUTER_RUNTIME_BRIDGE_TOKEN ??
								"",
						},
					]
				: []),
		],
	};
}
