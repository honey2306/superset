import { afterEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import supersetAcpMcpExtension, {
	type PiExtensionApi,
	StdioMcpClient,
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

async function waitForFile(
	filePath: string,
	timeoutMs = 1_000,
): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (existsSync(filePath)) return readFileSync(filePath, "utf8");
		await Bun.sleep(5);
	}
	throw new Error(`Timed out waiting for ${filePath}`);
}

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

test("waits for ask_user beyond the ordinary MCP tool timeout", async () => {
	const directory = mkdtempSync(path.join(os.tmpdir(), "pi-acp-mcp-ask-user-"));
	tempDirectories.push(directory);
	const serverPath = path.join(directory, "fake-mcp.ts");
	writeFileSync(
		serverPath,
		`import readline from "node:readline";
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method !== "tools/call") return;
  if (message.params?.name !== "ask_user") return;
  setTimeout(() => {
    console.log(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "answered" }] } }));
  }, 100);
});
`,
	);

	const client = new StdioMcpClient(
		{
			command: process.execPath,
			args: [serverPath],
			env: {},
		},
		{ toolCallTimeoutMs: 20 },
	);
	try {
		const askUser = client.callTool("ask_user", { questions: [] });
		const state = await Promise.race([
			askUser.then(
				() => "resolved",
				() => "rejected",
			),
			Bun.sleep(50).then(() => "pending"),
		]);
		expect(state).toBe("pending");
		expect(await askUser).toMatchObject({
			content: [{ type: "text", text: "answered" }],
		});
	} finally {
		await client.close();
	}
});

test("waits for wait_delegation beyond the ordinary MCP tool timeout", async () => {
	const directory = mkdtempSync(
		path.join(os.tmpdir(), "pi-acp-mcp-wait-delegation-"),
	);
	tempDirectories.push(directory);
	const serverPath = path.join(directory, "fake-mcp.ts");
	writeFileSync(
		serverPath,
		`import readline from "node:readline";
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method !== "tools/call") return;
  if (message.params?.name !== "wait_delegation") return;
  setTimeout(() => {
    console.log(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "completed" }] } }));
  }, 100);
});
`,
	);

	const client = new StdioMcpClient(
		{
			command: process.execPath,
			args: [serverPath],
			env: {},
		},
		{ toolCallTimeoutMs: 20 },
	);
	try {
		const wait = client.callTool("wait_delegation", {
			delegationRunId: "run-1",
		});
		const state = await Promise.race([
			wait.then(
				() => "resolved",
				() => "rejected",
			),
			Bun.sleep(50).then(() => "pending"),
		]);
		expect(state).toBe("pending");
		expect(await wait).toMatchObject({
			content: [{ type: "text", text: "completed" }],
		});
	} finally {
		await client.close();
	}
});

test("cancels timed-out non-interactive MCP calls", async () => {
	const directory = mkdtempSync(path.join(os.tmpdir(), "pi-acp-mcp-timeout-"));
	tempDirectories.push(directory);
	const serverPath = path.join(directory, "fake-mcp.ts");
	const cancellationPath = path.join(directory, "cancelled.json");
	writeFileSync(
		serverPath,
		`import { writeFileSync } from "node:fs";
import readline from "node:readline";
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "notifications/cancelled") {
    writeFileSync(${JSON.stringify(cancellationPath)}, JSON.stringify(message.params));
  }
});
`,
	);

	const client = new StdioMcpClient(
		{
			command: process.execPath,
			args: [serverPath],
			env: {},
		},
		{ toolCallTimeoutMs: 20 },
	);
	try {
		const slowCall = client.callTool("slow_tool", {});
		const outcome = await Promise.race([
			slowCall.then(
				() => "resolved",
				(error) => (error instanceof Error ? error.message : String(error)),
			),
			Bun.sleep(100).then(() => "still-pending"),
		]);
		expect(outcome).toBe("MCP request timed out: tools/call");
		const cancellation = JSON.parse(await waitForFile(cancellationPath)) as {
			requestId: number;
			reason: string;
		};
		expect(cancellation).toEqual({
			requestId: 1,
			reason: "MCP request timed out: tools/call",
		});
	} finally {
		await client.close();
	}
});
