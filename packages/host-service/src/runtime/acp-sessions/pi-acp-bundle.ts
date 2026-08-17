/**
 * pi-acp 0.0.33 has no ACP-specific configuration hook for its synchronous
 * npm upgrade check or startup prelude. Keep this narrow source patch at our
 * bundling boundary rather than modifying node_modules. The checks make an
 * upstream change fail the build instead of silently regressing startup.
 */
export function patchPiAcpBundle(source: string): string {
	const withRpcFlags = source.replace(
		'const args = ["--mode", "rpc", "--no-themes"];',
		`const args = [
  "--mode",
  "rpc",
  "--no-themes",
  ...(process.env.SUPERSET_PI_ACP_DISABLE_EXTENSIONS === "1" ? ["--no-extensions"] : []),
  ...(process.env.SUPERSET_PI_ACP_MCP_EXTENSION ? ["--extension", process.env.SUPERSET_PI_ACP_MCP_EXTENSION] : []),
];`,
	);
	if (withRpcFlags === source) {
		throw new Error("Unsupported pi-acp bundle: RPC launch flags changed");
	}
	const withQuietStartup = withRpcFlags.replace(
		"const quietStartup = getQuietStartup(params.cwd);",
		'const quietStartup = process.env.SUPERSET_PI_ACP_QUIET_STARTUP === "1" || getQuietStartup(params.cwd);',
	);
	if (withQuietStartup === withRpcFlags) {
		throw new Error("Unsupported pi-acp bundle: quiet startup hook changed");
	}
	const withCachedUpdateNotice = withQuietStartup.replace(
		/function buildUpdateNotice\(\) \{[\s\S]*?\n\}\nfunction buildStartupInfo\(/,
		`function buildUpdateNotice() {
  const cached = process.env.SUPERSET_PI_ACP_UPDATE_NOTICE;
  return typeof cached === "string" && cached.trim() ? cached.trim() : null;
}
function buildStartupInfo(`,
	);
	if (withCachedUpdateNotice === withQuietStartup) {
		throw new Error("Unsupported pi-acp bundle: update notice hook changed");
	}
	return withCachedUpdateNotice;
}
