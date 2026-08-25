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

async function runMcp(
	socketPath: string,
	requests: unknown[],
	role?: "root-coordinator" | "delegated-executor",
) {
	const child = Bun.spawn({
		cmd: [process.execPath, scriptPath],
		env: {
			...process.env,
			SUPERSET_ACP_DAEMON_SOCKET_PATH: socketPath,
			SUPERSET_ACP_SOURCE_SESSION_ID: "source-session",
			...(role ? { SUPERSET_ACP_SESSION_ROLE: role } : {}),
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
					op: string;
					params: unknown;
				};
				if (request.op === "supersetTool") {
					expect(request.params).toEqual({
						sourceSessionId: "source-session",
						name: "get_context",
						arguments: {},
					});
				} else {
					expect(request.op).toBe("getDelegatedExecution");
					expect(request.params).toEqual({});
				}
				socket.end(
					`${JSON.stringify({
						type: "response",
						id: request.id,
						ok: true,
						result:
							request.op === "getDelegatedExecution"
								? {
										enabled: true,
										valid: true,
										agent: "claude",
										model: "sonnet",
									}
								: {
										workspaceId: "workspace-1",
										delegatedExecution: {
											enabled: true,
											valid: true,
											agent: "claude",
											model: "sonnet",
										},
									},
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
			const responseFor = (id: number) =>
				responses.find((response) => response.id === id);
			const initializeResponse = responseFor(1);
			const toolsListResponse = responseFor(2);
			const toolCallResponse = responseFor(3);

			expect(initializeResponse).toMatchObject({
				id: 1,
				result: { capabilities: { tools: {} } },
			});
			expect(
				(initializeResponse?.result as { instructions?: string }).instructions,
			).toContain("execute work directly by default");
			const tools = (
				toolsListResponse?.result as {
					tools: Array<{
						name: string;
						description?: string;
						inputSchema: Record<string, unknown>;
					}>;
				}
			).tools;
			expect(
				tools.some((tool) => tool.name === "continue_in_new_session"),
			).toBe(true);
			expect(tools.some((tool) => tool.name === "ask_user")).toBe(true);
			expect(tools.some((tool) => tool.name === "open_session")).toBe(true);
			expect(
				tools.find((tool) => tool.name === "open_session")?.inputSchema,
			).toMatchObject({
				required: ["sessionId"],
			});
			expect(tools.some((tool) => tool.name === "wait_delegation")).toBe(true);
			expect(
				tools.some((tool) => tool.name === "report_delegation_result"),
			).toBe(false);
			expect(tools.some((tool) => tool.name === "update_plan")).toBe(true);
			expect(
				tools.find((tool) => tool.name === "update_plan")?.inputSchema,
			).toMatchObject({
				type: "object",
				properties: {
					plan: {
						type: "array",
						minItems: 1,
						maxItems: 50,
					},
				},
				required: ["plan"],
			});
			expect(
				tools.find((tool) => tool.name === "update_plan")?.description,
			).toContain("provider-specific");
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
			expect(tools.some((tool) => tool.name === "delegate")).toBe(true);
			expect(
				tools.find((tool) => tool.name === "delegate")?.description,
			).toContain("Execute directly by default");
			expect(
				tools.find((tool) => tool.name === "delegate")?.inputSchema,
			).toMatchObject({
				properties: {
					contextSnapshot: {
						type: "object",
						properties: {
							summary: { maxLength: 4_000 },
							relevantFacts: { maxItems: 20 },
							relevantFiles: { maxItems: 30 },
							constraints: { maxItems: 20 },
							acceptanceChecks: { maxItems: 20 },
						},
					},
				},
			});
			expect(toolCallResponse).toMatchObject({
				id: 3,
				result: {
					content: [
						{
							type: "text",
							text: '{"workspaceId":"workspace-1","delegatedExecution":{"enabled":true,"valid":true,"agent":"claude","model":"sonnet"}}',
						},
					],
				},
			});
		} finally {
			server.close();
		}
	});

	test("hides delegate when delegated execution is disabled or invalid", async () => {
		for (const [name, delegatedExecution] of [
			["disabled", { enabled: false }],
			[
				"invalid",
				{
					enabled: true,
					valid: false,
					error: "The selected executor no longer exists.",
				},
			] as const,
		] as const) {
			const socketPath = path.join(tempDir, `${name}.sock`);
			const server = net.createServer((socket) => {
				socket.setEncoding("utf8");
				socket.once("data", (chunk: string) => {
					const request = JSON.parse(chunk.trim()) as {
						id: string;
						op: string;
						params: unknown;
					};
					expect(request.op).toBe("getDelegatedExecution");
					expect(request.params).toEqual({});
					socket.end(
						`${JSON.stringify({
							type: "response",
							id: request.id,
							ok: true,
							result: delegatedExecution,
						})}\n`,
					);
				});
			});
			await listen(server, socketPath);
			try {
				const responses = await runMcp(socketPath, [
					{ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
				]);
				const tools = (
					responses[0]?.result as { tools: Array<{ name: string }> }
				).tools;
				expect(tools.some((tool) => tool.name === "delegate")).toBe(false);
				expect(tools.some((tool) => tool.name === "wait_delegation")).toBe(
					true,
				);
			} finally {
				server.close();
			}
		}
	});

	test("hides delegate and coordinator instructions in a delegated child", async () => {
		const responses = await runMcp(
			path.join(tempDir, "delegated-child.sock"),
			[
				{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
				{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
			],
			"delegated-executor",
		);
		expect(
			(responses[0]?.result as { instructions?: unknown }).instructions,
		).toBeUndefined();
		const tools = (responses[1]?.result as { tools: Array<{ name: string }> })
			.tools;
		expect(tools.some((tool) => tool.name === "delegate")).toBe(false);
		expect(tools.some((tool) => tool.name === "wait_delegation")).toBe(false);
		expect(tools.some((tool) => tool.name === "report_delegation_result")).toBe(
			true,
		);
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
