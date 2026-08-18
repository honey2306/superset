import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const tempDir = mkdtempSync(path.join(os.tmpdir(), "superset-mcp-test-"));
const scriptPath = path.resolve(import.meta.dir, "superset-mcp.ts");

afterAll(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

async function listen(server: net.Server, socketPath: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(socketPath, resolve);
	});
}

async function runMcp(socketPath: string, requests: unknown[]) {
	const child = Bun.spawn({
		cmd: [process.execPath, scriptPath],
		env: {
			...process.env,
			SUPERSET_ACP_DAEMON_SOCKET_PATH: socketPath,
			SUPERSET_ACP_SOURCE_SESSION_ID: "source-session",
		},
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	child.stdin.write(
		`${requests.map((request) => JSON.stringify(request)).join("\n")}\n`,
	);
	child.stdin.end();
	const stdout = await new Response(child.stdout).text();
	const stderr = await new Response(child.stderr).text();
	const exitCode = await child.exited;
	if (exitCode !== 0) throw new Error(stderr || `MCP exited ${exitCode}`);
	return stdout
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("Superset MCP process", () => {
	test("lists tools and forwards a tool call to the daemon socket", async () => {
		const socketPath = path.join(tempDir, "success.sock");
		const server = net.createServer((socket) => {
			socket.setEncoding("utf8");
			socket.once("data", (chunk: string) => {
				const request = JSON.parse(chunk.trim()) as {
					id: string;
					params: unknown;
				};
				expect(request.params).toEqual({
					sourceSessionId: "source-session",
					name: "get_context",
					arguments: {},
				});
				socket.end(
					`${JSON.stringify({
						type: "response",
						id: request.id,
						ok: true,
						result: { workspaceId: "workspace-1" },
					})}\n`,
				);
			});
		});
		await listen(server, socketPath);
		try {
			const responses = await runMcp(socketPath, [
				{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
				{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
				{
					jsonrpc: "2.0",
					id: 3,
					method: "tools/call",
					params: { name: "get_context", arguments: {} },
				},
			]);

			expect(responses[0]).toMatchObject({
				id: 1,
				result: { capabilities: { tools: {} } },
			});
			const tools = (
				responses[1]?.result as {
					tools: Array<{
						name: string;
						inputSchema: Record<string, unknown>;
					}>;
				}
			).tools;
			expect(
				tools.some((tool) => tool.name === "continue_in_new_session"),
			).toBe(true);
			expect(tools.some((tool) => tool.name === "ask_user")).toBe(true);
			expect(tools.some((tool) => tool.name === "open_merge_request")).toBe(
				true,
			);
			expect(
				tools.find((tool) => tool.name === "open_merge_request")?.inputSchema,
			).toEqual({
				type: "object",
				properties: {},
				additionalProperties: false,
			});
			expect(tools.some((tool) => tool.name === "get_session_messages")).toBe(
				true,
			);
			expect(responses[2]).toMatchObject({
				id: 3,
				result: {
					content: [{ type: "text", text: '{"workspaceId":"workspace-1"}' }],
				},
			});
		} finally {
			server.close();
		}
	});

	test("forwards MCP cancellation and closes a pending ask_user daemon call", async () => {
		const socketPath = path.join(tempDir, "cancelled.sock");
		let daemonCallClosed = false;
		const server = net.createServer((socket) => {
			socket.once("close", () => {
				daemonCallClosed = true;
			});
		});
		await listen(server, socketPath);
		try {
			const responses = await runMcp(socketPath, [
				{
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: {
						name: "ask_user",
						arguments: {
							questions: [
								{
									question: "Continue?",
									header: "Confirm",
									options: [{ label: "Yes" }, { label: "No" }],
								},
							],
						},
					},
				},
				{
					jsonrpc: "2.0",
					method: "notifications/cancelled",
					params: { requestId: 1, reason: "turn cancelled" },
				},
			]);

			expect(responses[0]).toMatchObject({
				id: 1,
				result: { isError: true },
			});
			await Bun.sleep(10);
			expect(daemonCallClosed).toBe(true);
		} finally {
			server.close();
		}
	});

	test("normalizes Claude's zero-argument placeholder before forwarding a merge request", async () => {
		const socketPath = path.join(tempDir, "merge-request-noargs.sock");
		const server = net.createServer((socket) => {
			socket.setEncoding("utf8");
			socket.once("data", (chunk: string) => {
				const request = JSON.parse(chunk.trim()) as {
					id: string;
					params: unknown;
				};
				expect(request.params).toEqual({
					sourceSessionId: "source-session",
					name: "open_merge_request",
					arguments: {},
				});
				socket.end(
					`${JSON.stringify({
						type: "response",
						id: request.id,
						ok: true,
						result: { opened: true },
					})}\n`,
				);
			});
		});
		await listen(server, socketPath);
		try {
			const responses = await runMcp(socketPath, [
				{
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: {
						name: "open_merge_request",
						arguments: {
							_noargs: "unused placeholder (tool takes no arguments)",
						},
					},
				},
			]);

			expect(responses[0]).toMatchObject({
				id: 1,
				result: {
					content: [{ type: "text", text: '{"opened":true}' }],
				},
			});
		} finally {
			server.close();
		}
	});

	test("returns an MCP error result when the daemon closes before responding", async () => {
		const socketPath = path.join(tempDir, "closed.sock");
		const server = net.createServer((socket) => socket.end());
		await listen(server, socketPath);
		try {
			const responses = await runMcp(socketPath, [
				{
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: { name: "get_context", arguments: {} },
				},
			]);
			expect(responses[0]).toMatchObject({
				id: 1,
				result: { isError: true },
			});
		} finally {
			server.close();
		}
	});
});
