/**
 * Bundles the host-service entry point into a single JS file that can be
 * executed by a standalone Node.js runtime. Native addons (better-sqlite3,
 * node-pty) are marked external and must be resolved at runtime from
 * lib/native/ in the distribution bundle.
 */
import { existsSync, mkdirSync } from "node:fs";

const outdir = "dist";
if (!existsSync(outdir)) {
	mkdirSync(outdir, { recursive: true });
}

const result = await Bun.build({
	entrypoints: ["src/serve.ts"],
	target: "node",
	outdir,
	naming: "host-service.js",
	format: "esm",
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
	external: [
		"better-sqlite3",
		"node-pty",
		"@parcel/watcher",
		"libsql",
		"onnxruntime-node",
		"@anush008/tokenizers",
		"@anush008/tokenizers-darwin-universal",
		"@anush008/tokenizers-linux-x64-gnu",
		"@anush008/tokenizers-linux-arm64-gnu",
		"@anush008/tokenizers-win32-x64-msvc",
		"@mastra/duckdb",
		"@duckdb/node-api",
		"@duckdb/node-bindings",
		"@duckdb/node-bindings-darwin-arm64",
		"@duckdb/node-bindings-darwin-x64",
		"@duckdb/node-bindings-linux-x64",
		"@duckdb/node-bindings-linux-arm64",
		"@duckdb/node-bindings-win32-x64",
		"@duckdb/node-bindings-win32-arm64",
	],
});

if (!result.success) {
	console.error("[host-service] build failed:");
	for (const log of result.logs) {
		console.error(log);
	}
	process.exit(1);
}

// Worker-thread bundle, emitted side-by-side so the pool's script
// resolution finds it next to host-service.js (see host-worker-pool.ts).
const workerResult = await Bun.build({
	entrypoints: ["src/workers/host-worker.ts"],
	target: "node",
	outdir,
	naming: "host-worker.js",
	format: "esm",
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
});

if (!workerResult.success) {
	console.error("[host-service] host-worker build failed:");
	for (const log of workerResult.logs) {
		console.error(log);
	}
	process.exit(1);
}

// Detached ACP owner. It is adopted across host-service/Desktop restarts and
// keeps adapter processes, turns, permissions, and journals alive.
const acpDaemonResult = await Bun.build({
	entrypoints: ["src/runtime/acp-sessions/daemon-entry.ts"],
	target: "node",
	outdir,
	naming: "acp-daemon.js",
	format: "esm",
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
	external: ["better-sqlite3"],
});

if (!acpDaemonResult.success) {
	console.error("[host-service] ACP daemon build failed:");
	for (const log of acpDaemonResult.logs) console.error(log);
	process.exit(1);
}

// Session-scoped MCP server that exposes Superset orchestration tools to every
// ACP harness and calls back into the detached daemon over its local socket.
const supersetMcpResult = await Bun.build({
	entrypoints: ["src/runtime/acp-sessions/superset-mcp.ts"],
	target: "node",
	outdir,
	naming: "superset-mcp.js",
	format: "esm",
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
});

if (!supersetMcpResult.success) {
	console.error("[host-service] Superset MCP build failed:");
	for (const log of supersetMcpResult.logs) console.error(log);
	process.exit(1);
}

// This is launched as an ACP subprocess by acp-sessions.ts, so it must be
// emitted beside host-service.js rather than relying on a source-tree .ts file.
const codexBridgeResult = await Bun.build({
	entrypoints: ["src/runtime/acp-sessions/codex-app-server-acp.ts"],
	target: "node",
	outdir,
	naming: "codex-app-server-acp.js",
	format: "esm",
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
});

if (!codexBridgeResult.success) {
	console.error("[host-service] Codex ACP bridge build failed:");
	for (const log of codexBridgeResult.logs) {
		console.error(log);
	}
	process.exit(1);
}

// The Pi ACP adapter owns the SDK inside its independent subprocess. Bundle it
// beside host-service so packaged builds do not depend on a globally installed
// Pi CLI or an external RPC bridge. Keep the artifact name for host compatibility.
const piBridgeResult = await Bun.build({
	entrypoints: ["src/runtime/acp-sessions/pi-sdk-acp.ts"],
	target: "node",
	outdir,
	naming: "pi-acp.js",
	format: "esm",
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
});

if (!piBridgeResult.success) {
	console.error("[host-service] Pi ACP bridge build failed:");
	for (const log of piBridgeResult.logs) {
		console.error(log);
	}
	process.exit(1);
}

console.log(
	`[host-service] bundled to ${outdir}/host-service.js + ${outdir}/host-worker.js + ${outdir}/acp-daemon.js + ${outdir}/superset-mcp.js + ${outdir}/codex-app-server-acp.js + ${outdir}/pi-acp.js`,
);
