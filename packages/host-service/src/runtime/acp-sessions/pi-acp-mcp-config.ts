import {
	chmodSync,
	existsSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@agentclientprotocol/sdk";

interface PiMcpServerEntry {
	command: string;
	args: string[];
	env: Record<string, string>;
}

export interface PiMcpConfig {
	mcpServers: Record<string, PiMcpServerEntry>;
}

export const PI_ACP_MCP_CONFIG_ENV = "SUPERSET_PI_ACP_MCP_CONFIG";
export const PI_ACP_MCP_EXTENSION_ENV = "SUPERSET_PI_ACP_MCP_EXTENSION";

const EXTENSION_FILE_NAME = "pi-acp-mcp-extension.js";

function serverEntry(server: McpServer): PiMcpServerEntry {
	if (!("command" in server)) {
		throw new Error(
			`Unsupported ACP MCP transport for ${server.name}: ${server.type}`,
		);
	}
	return {
		command: server.command,
		args: server.args,
		env: Object.fromEntries(server.env.map(({ name, value }) => [name, value])),
	};
}

export function piMcpConfig(mcpServers: readonly McpServer[]): PiMcpConfig {
	const servers: Record<string, PiMcpServerEntry> = {};
	for (const server of mcpServers) {
		if (servers[server.name]) {
			throw new Error(`Duplicate ACP MCP server name: ${server.name}`);
		}
		servers[server.name] = serverEntry(server);
	}
	return { mcpServers: servers };
}

export interface MaterializedPiMcpConfig {
	path: string;
	dispose: () => void;
}

/**
 * Materialize session-scoped MCP declarations without leaking command env
 * values through the process table or mutating the user's MCP configuration.
 */
export function materializePiMcpConfig(
	mcpServers: readonly McpServer[],
): MaterializedPiMcpConfig {
	const directory = mkdtempSync(path.join(os.tmpdir(), "superset-pi-mcp-"));
	chmodSync(directory, 0o700);
	const configPath = path.join(directory, "mcp.json");
	writeFileSync(configPath, JSON.stringify(piMcpConfig(mcpServers)), {
		encoding: "utf8",
		mode: 0o600,
	});
	let disposed = false;
	return {
		path: configPath,
		dispose: () => {
			if (disposed) return;
			disposed = true;
			rmSync(directory, { force: true, recursive: true });
		},
	};
}

export function resolvePiAcpMcpExtensionPath(
	moduleUrl: string = import.meta.url,
	resourcesPath: string | undefined = (
		process as NodeJS.Process & { resourcesPath?: string }
	).resourcesPath,
): string {
	if (process.env[PI_ACP_MCP_EXTENSION_ENV]) {
		return process.env[PI_ACP_MCP_EXTENSION_ENV];
	}
	const here = path.dirname(fileURLToPath(moduleUrl));
	const candidates = [
		...(resourcesPath
			? [path.join(resourcesPath, "pi-extensions", EXTENSION_FILE_NAME)]
			: []),
		path.join(here, EXTENSION_FILE_NAME),
		path.resolve(here, "..", EXTENSION_FILE_NAME),
	];
	const resolved = candidates.find(existsSync);
	if (resolved) return resolved;
	throw new Error(
		`Missing bundled Pi ACP MCP extension; checked: ${candidates.join(", ")}`,
	);
}
