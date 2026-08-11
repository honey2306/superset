import { statSync } from "node:fs";
import path from "node:path";
import type { McpServer } from "@agentclientprotocol/sdk";

/**
 * Set to `0` to disable. Set to `1` to permit an `uvx` fallback when Browser
 * Use is not installed, or `uvx` to force that fallback. The default uses a
 * locally installed executable only, so merely opening the desktop app never
 * triggers a package download.
 */
export const BROWSER_USE_MCP_ENV = "SUPERSET_BROWSER_USE_MCP";

function executableOnPath(
	name: string,
	pathValue = process.env.PATH,
): string | null {
	if (!pathValue) return null;
	const extensions =
		process.platform === "win32"
			? (process.env.PATHEXT?.split(";").filter(Boolean) ?? [
					".EXE",
					".CMD",
					".BAT",
				])
			: [""];
	for (const directory of pathValue.split(path.delimiter)) {
		if (!path.isAbsolute(directory)) continue;
		for (const extension of extensions) {
			const candidate = path.join(directory, `${name}${extension}`);
			try {
				const stat = statSync(candidate);
				if (!stat.isFile()) continue;
				if (process.platform === "win32" || (stat.mode & 0o111) !== 0)
					return candidate;
			} catch {
				// Continue looking when a PATH entry has no usable executable.
			}
		}
	}
	return null;
}

/**
 * Build the one shared local Browser Use MCP declaration passed to ACP
 * session/new and session/load. Browser Use 3 uses `--cli-mcp`. A local
 * binary is enabled by default; `uvx` requires explicit enablement because
 * it may install/download Browser Use on first use.
 */
export function browserUseMcpServerFromEnvironment(
	environment: NodeJS.ProcessEnv = process.env,
): McpServer | null {
	const mode = environment[BROWSER_USE_MCP_ENV];
	if (mode === "0") return null;

	const browserUse =
		mode === "uvx" ? null : executableOnPath("browser-use", environment.PATH);
	if (browserUse !== null) {
		return {
			name: "browser-use",
			command: browserUse,
			args: ["--cli-mcp"],
			env: [],
		};
	}

	if (mode !== "1" && mode !== "uvx") return null;
	const uvx = executableOnPath("uvx", environment.PATH);
	if (!uvx) return null;
	return {
		name: "browser-use",
		command: uvx,
		args: ["browser-use@latest", "--cli-mcp"],
		env: [],
	};
}
