import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export function resolvePeekabooBridgeSocket(
	environment: NodeJS.ProcessEnv = process.env,
): string | null {
	const configured = environment.SUPERSET_PEEKABOO_BRIDGE_SOCKET;
	if (configured) return existsSync(configured) ? configured : null;
	const root =
		environment.SUPERSET_PEEKABOO_HOME ??
		path.join(homedir(), "Library", "Application Support", "Peekaboo");
	const socketPath = path.join(root, "bridge.sock");
	return existsSync(socketPath) ? socketPath : null;
}

export function peekabooBridgeArguments(socketPath: string | null): string[] {
	return [
		"mcp",
		"--allow-foreground",
		...(socketPath ? ["--bridge-socket", socketPath] : []),
	];
}
