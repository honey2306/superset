import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import supersetAcpMcpExtension, {
	type PiExtensionApi,
} from "./pi-acp-mcp-extension";

const tempDirectories: string[] = [];
const previousConfig = process.env.SUPERSET_PI_ACP_MCP_CONFIG;

afterEach(() => {
	if (previousConfig === undefined) {
		delete process.env.SUPERSET_PI_ACP_MCP_CONFIG;
	} else {
		process.env.SUPERSET_PI_ACP_MCP_CONFIG = previousConfig;
	}
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

test("registers and invokes ACP-provided MCP tools", async () => {
	const directory = mkdtempSync(path.join(os.tmpdir(), "pi-acp-mcp-test-"));
	tempDirectories.push(directory);
	const serverPath = path.join(directory, "fake-mcp.ts");
	const stoppedPath = path.join(directory, "stopped");
	writeFileSync(
		serverPath,
		`import { writeFileSync } from "node:fs";
import readline from "node:readline";
let initializeId;
process.on("SIGTERM", () => {
  writeFileSync(${JSON.stringify(stoppedPath)}, "stopped");
  process.exit(0);
});
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    initializeId = message.id;
    console.log(JSON.stringify({ jsonrpc: "2.0", id: "server-ping", method: "ping", params: {} }));
  } else if (message.id === "server-ping" && message.result) {
    console.log(JSON.stringify({ jsonrpc: "2.0", id: initializeId, result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "fake", version: "1" } } }));
  } else if (message.method === "tools/list" && !message.params.cursor) {
    console.log(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "browser_exec", description: "Execute", inputSchema: { type: "object", properties: {} } }], nextCursor: "page-2" } }));
  } else if (message.method === "tools/list") {
    console.log(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "browser_screenshot", description: "Capture", inputSchema: { type: "object", properties: {} } }] } }));
  } else if (message.method === "tools/call") {
    console.log(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" }] } }));
  }
});
`,
	);
	const configPath = path.join(directory, "mcp.json");
	writeFileSync(
		configPath,
		JSON.stringify({
			mcpServers: {
				"browser-use": {
					command: process.execPath,
					args: [serverPath],
					env: {},
				},
			},
		}),
	);
	process.env.SUPERSET_PI_ACP_MCP_CONFIG = configPath;

	const tools: Array<Parameters<PiExtensionApi["registerTool"]>[0]> = [];
	let shutdown: (() => Promise<void>) | undefined;
	const pi: PiExtensionApi = {
		registerTool: (tool) => tools.push(tool),
		on: (_event, handler) => {
			shutdown = handler;
		},
	};

	await supersetAcpMcpExtension(pi);
	expect(tools.map((tool) => tool.name)).toEqual([
		"browser_exec",
		"browser_screenshot",
	]);
	expect(await tools[1]?.execute("call-1", {})).toMatchObject({
		content: [{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" }],
		isError: false,
	});
	await shutdown?.();
	expect(existsSync(stoppedPath)).toBe(true);
});
