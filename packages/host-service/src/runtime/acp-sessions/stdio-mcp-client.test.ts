import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StdioMcpClient } from "./stdio-mcp-client";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

async function waitForFile(path: string): Promise<void> {
	const deadline = Date.now() + 1_000;
	while (!existsSync(path)) {
		if (Date.now() >= deadline)
			throw new Error(`Timed out waiting for ${path}`);
		await Bun.sleep(10);
	}
}

test("times out a tool call and notifies the MCP server of cancellation", async () => {
	const root = mkdtempSync(join(tmpdir(), "stdio-mcp-client-"));
	roots.push(root);
	const cancelledMarker = join(root, "cancelled");
	const serverPath = join(root, "never-finishes-mcp.ts");
	writeFileSync(
		serverPath,
		`import { writeFileSync } from "node:fs";
import readline from "node:readline";
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {} }));
  else if (request.method === "tools/list") console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { tools: [{ name: "slow", inputSchema: { type: "object" } }] } }));
  else if (request.method === "notifications/cancelled") writeFileSync(process.argv[2], JSON.stringify(request.params));
});
`,
	);
	const client = new StdioMcpClient(
		{
			name: "slow",
			command: process.execPath,
			args: [serverPath, cancelledMarker],
			env: [],
		},
		{ toolCallTimeoutMs: 30 },
	);
	try {
		await client.initialize();
		expect((await client.listTools()).map(({ name }) => name)).toEqual([
			"slow",
		]);
		await expect(client.callTool("slow", {})).rejects.toThrow(
			"MCP request timed out: tools/call",
		);
		await waitForFile(cancelledMarker);
	} finally {
		await client.close();
	}
});
