import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { StdioMcpClient } from "./stdio-mcp-client";

// Exercise the shipped entry point, including its internal RPC IDs and cancellation.
async function fixture() {
	const root = await mkdtemp(path.join(tmpdir(), "superset-computer-mcp-"));
	const executable = path.join(root, "peekaboo");
	const log = path.join(root, "calls.jsonl");
	const bridge = path.join(root, "bridge.sock");
	await writeFile(bridge, "fixture");
	await writeFile(
		executable,
		`#!${process.execPath}
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
const receipt = { pid: 42, window_id: 100, process_start_identity_decimal: '123456789' };
if (process.argv.includes('see')) {
 process.stdout.write(JSON.stringify({ success: true, target_receipt: receipt, data: { application_name: 'TextEdit', snapshot_id: 'native', ui_elements: [{ id: 'elem_0', ax_role: 'AXWindow', bounds: { x: 0, y: 0, width: 600, height: 400 } }, { id: 'elem_2', ax_role: 'AXTextArea', identifier: 'editor', value: 'hello' }] } }));
 process.exit(0);
}
for await (const line of createInterface({ input: process.stdin })) {
 const m = JSON.parse(line);
 if (!m.method || m.id === undefined) continue;
 const answer = (result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\\n');
 if (m.method === 'initialize') answer({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } });
 else if (m.method === 'tools/list') answer({ tools: [{ name: 'press', inputSchema: { type: 'object' } }] });
 else if (m.method === 'tools/call') {
  const { name, arguments: args } = m.params;
  appendFileSync(${JSON.stringify(log)}, JSON.stringify({ name, args }) + '\\n');
  if (name === 'inspect_ui') answer({ isError: false, _meta: { target_receipt: receipt }, content: [{ type: 'text', text: 'UI Text Inspection\\nSnapshot ID: exact\\n  elem_0 - "Document" - at (0, 0) size 600x400' }] });
  else if (name === 'press') answer({ isError: true, _meta: { state: 'dispatched_unverified', mutation_dispatched: true, effect: 'unverifiable' }, content: [{ type: 'text', text: 'Unconfirmed' }] });
  else if (name === 'sleep') setTimeout(() => answer({ content: [{ type: 'text', text: 'late' }] }), 100);
  else answer({ isError: false, content: [{ type: 'text', text: 'ok' }] });
 }
}
`,
		{ mode: 0o700 },
	);
	const client = new StdioMcpClient({
		name: "computer-use-probe",
		command: process.execPath,
		args: [path.join(import.meta.dir, "computer-use-mcp.ts")],
		env: [
			{ name: "SUPERSET_PEEKABOO_PATH", value: executable },
			{ name: "SUPERSET_PEEKABOO_BRIDGE_SOCKET", value: bridge },
		],
	});
	await client.initialize();
	return {
		client,
		log,
		async close() {
			await client.close();
			await rm(root, { recursive: true, force: true });
		},
	};
}

describe("Computer Use MCP process", () => {
	test("verifies through the structured CLI reader in the real MCP entry point", async () => {
		const f = await fixture();
		try {
			const result = await f.client.callTool("computer_verify_state", {
				pid: 42,
				window_id: 100,
				predicates: [
					{
						kind: "element_value",
						selector: { identifier: "editor" },
						expected_value: "hello",
					},
				],
			});
			expect(result.isError).toBe(false);
			expect(result._meta).toMatchObject({
				status: "satisfied",
				verifier: "superset-targeted-ax",
			});
		} finally {
			await f.close();
		}
	});
	test("routes preflight and readback internally and retains parent tool results", async () => {
		const f = await fixture();
		try {
			expect((await f.client.listTools()).map((t) => t.name)).toEqual([
				"computer_press",
			]);
			const result = await f.client.callTool("computer_press", {
				app: "TextEdit",
				keys: ["cmd+s"],
				foreground: true,
			});
			expect(JSON.stringify(result.content)).toContain("Do not repeat");
			expect(result.isError).toBe(true);
			const calls = (await readFile(f.log, "utf8"))
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
			expect(calls.map((c) => c.name)).toEqual([
				"inspect_ui",
				"app",
				"inspect_ui",
				"press",
				"inspect_ui",
			]);
			expect(calls[3].args.window_id).toBe(100);
			expect(calls[3].args.foreground).toBe(false);
		} finally {
			await f.close();
		}
	});
	test("cancels an in-flight call without blocking the next tool call", async () => {
		const f = await fixture();
		try {
			const controller = new AbortController();
			const pending = f.client.callTool(
				"computer_sleep",
				{},
				controller.signal,
			);
			const cancelled = pending.then(
				() => "unexpected success",
				(error: Error) => error.message,
			);
			// Wait until the tool actually reached the fake upstream, then cancel it.
			for (let i = 0; i < 50; i++) {
				if ((await readFile(f.log, "utf8").catch(() => "")).includes('"sleep"'))
					break;
				await new Promise((resolve) => setTimeout(resolve, 2));
			}
			controller.abort();
			expect(await cancelled).toContain("cancelled");
			const result = await f.client.callTool("computer_permissions", {});
			expect(result.isError).toBe(false);
		} finally {
			await f.close();
		}
	});
	test("rejects excluded tools before upstream dispatch", async () => {
		const f = await fixture();
		try {
			await expect(f.client.callTool("computer_browser", {})).rejects.toThrow(
				"not allowed",
			);
			expect(await readFile(f.log, "utf8").catch(() => "")).toBe("");
		} finally {
			await f.close();
		}
	});
});
