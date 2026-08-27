import { afterEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@agentclientprotocol/sdk";
import { BROWSER_USE_MCP_TOOLS } from "./browser-use-mcp";
import { LAZY_MCP_CONFIG_ENV, wrapMcpServerForLazyStartup } from "./lazy-mcp";
import { isMcpServerProcess, StdioMcpClient } from "./stdio-mcp-client";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

test("wraps an upstream MCP without exposing its configuration in argv", () => {
	const upstream: Extract<McpServer, { command: string }> = {
		name: "browser-use",
		command: "/opt/browser-use",
		args: ["--cli-mcp"],
		env: [{ name: "BROWSER_TOKEN", value: "secret" }],
	};
	const wrapped = wrapMcpServerForLazyStartup(upstream, BROWSER_USE_MCP_TOOLS, {
		execPath: "/usr/bin/node",
		scriptPath: "/app/lazy-mcp-proxy.js",
	});

	expect(wrapped).toMatchObject({
		name: "browser-use",
		command: "/usr/bin/node",
		args: ["/app/lazy-mcp-proxy.js"],
	});
	if (!("command" in wrapped)) throw new Error("Expected stdio MCP server");
	expect(wrapped.args.join(" ")).not.toContain("secret");
	const configEntry = wrapped.env.find(
		({ name }) => name === LAZY_MCP_CONFIG_ENV,
	);
	expect(JSON.parse(configEntry?.value ?? "null")).toMatchObject({
		upstream,
		tools: BROWSER_USE_MCP_TOOLS,
	});
});

test("starts the upstream once on the first tool call, not initialize or list", async () => {
	const root = mkdtempSync(join(tmpdir(), "lazy-mcp-proxy-"));
	roots.push(root);
	const marker = join(root, "upstream-starts");
	const serverPath = join(root, "fake-browser-mcp.ts");
	writeFileSync(
		serverPath,
		`import { appendFileSync } from "node:fs";
import readline from "node:readline";
appendFileSync(process.argv[2], "started\\n");
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1" } } }));
  } else if (request.method === "tools/list") {
    console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { tools: ${JSON.stringify(BROWSER_USE_MCP_TOOLS)} } }));
  } else if (request.method === "tools/call") {
    console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: "called:" + request.params.name }] } }));
  }
});
`,
	);
	const wrapped = wrapMcpServerForLazyStartup(
		{
			name: "browser-use",
			command: process.execPath,
			args: [serverPath, marker, "--cli-mcp"],
			env: [],
		},
		BROWSER_USE_MCP_TOOLS,
		{
			execPath: process.execPath,
			scriptPath: join(import.meta.dir, "lazy-mcp-proxy.ts"),
		},
	);
	if (!isMcpServerProcess(wrapped)) throw new Error("Expected stdio proxy");
	const client = new StdioMcpClient(wrapped, {
		clientInfo: { name: "lazy-proxy-test", version: "1" },
	});
	try {
		await client.initialize();
		expect((await client.listTools()).map((tool) => tool.name)).toEqual([
			"browser_exec",
			"browser_screenshot",
		]);
		expect(existsSync(marker)).toBe(false);

		const [first, second] = await Promise.all([
			client.callTool("browser_exec", { code: "page_info()" }),
			client.callTool("browser_screenshot", { full: false }),
		]);
		expect(first).toMatchObject({
			content: [{ type: "text", text: "called:browser_exec" }],
		});
		expect(second).toMatchObject({
			content: [{ type: "text", text: "called:browser_screenshot" }],
		});
		expect(readFileSync(marker, "utf8").trim().split("\n")).toHaveLength(1);
	} finally {
		await client.close();
	}
});
