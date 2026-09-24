import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { StdioMcpClient } from "./stdio-mcp-client";

interface RecordedCall {
	sessionId: string;
	name: string;
	arguments: Record<string, unknown>;
}

async function fixture() {
	const root = await mkdtemp(path.join(tmpdir(), "superset-computer-runtime-"));
	const socketPath =
		process.platform === "win32"
			? `\\\\.\\pipe\\superset-computer-test-${randomUUID()}`
			: path.join(root, "computer.sock");
	const token = "computer-runtime-test-token";
	const calls: RecordedCall[] = [];
	let cancelledConnections = 0;

	const tools = [
		{
			name: "list_apps",
			description: "List native applications.",
			inputSchema: {
				type: "object",
				additionalProperties: false,
				properties: {
					session: { type: "string" },
				},
			},
		},
		{
			name: "get_window_state",
			description: "Observe one exact window.",
			inputSchema: {
				type: "object",
				additionalProperties: false,
				properties: {
					session: { type: "string" },
					pid: { type: "integer" },
					window_id: { type: "integer" },
				},
				required: ["session", "pid", "window_id"],
			},
		},
		{
			name: "verify_state",
			description: "Verify desktop state.",
			inputSchema: {
				type: "object",
				properties: {
					session: { type: "string" },
					pid: { type: "integer" },
				},
			},
		},
		{
			name: "press_key",
			description: "Press a key.",
			inputSchema: {
				type: "object",
				properties: {
					session: { type: "string" },
					key: { type: "string" },
				},
				required: ["session", "key"],
			},
		},
		...[
			"superset_window",
			"superset_space",
			"superset_dock",
			"superset_app",
			"superset_paste",
			"superset_dialog",
			"superset_action",
		].map((name) => ({
			name,
			description: "Superset high-level Computer Runtime tool.",
			inputSchema: {
				type: "object",
				additionalProperties: false,
				properties: { action: { type: "string" } },
			},
		})),
		{
			name: "browser_navigate",
			description: "Provider browser tool that Superset must hide.",
			inputSchema: { type: "object", properties: {} },
		},
	];

	const server = net.createServer((socket) => {
		socket.setEncoding("utf8");
		let buffer = "";
		let replied = false;
		socket.on("data", (chunk: string) => {
			buffer += chunk;
			const newline = buffer.indexOf("\n");
			if (newline < 0) return;
			const request = JSON.parse(buffer.slice(0, newline)) as {
				id: string;
				token: string;
				method: string;
				params?: Record<string, unknown>;
			};
			if (request.token !== token) {
				socket.write(
					`${JSON.stringify({
						id: request.id,
						ok: false,
						error: "bad token",
					})}\n`,
				);
				return;
			}
			const reply = (result: unknown) => {
				if (socket.destroyed) return;
				replied = true;
				socket.write(
					`${JSON.stringify({ id: request.id, ok: true, result })}\n`,
				);
			};
			if (request.method === "tools") {
				reply({
					capability_version: "1",
					schema_version: "1",
					tools,
				});
				return;
			}
			if (request.method === "permissions") {
				reply({
					platform: process.platform,
					accessibility: true,
					screenRecording: true,
					ready: true,
					prompted: request.params?.prompt === true,
					relaunchRequired: false,
				});
				return;
			}
			if (request.method === "endTurn") {
				reply({
					ownerSessionId: null,
					generation: 4,
					waiting: 0,
					activeCalls: 0,
				});
				return;
			}
			if (request.method !== "callTool") {
				socket.write(
					`${JSON.stringify({
						id: request.id,
						ok: false,
						error: "unknown method",
					})}\n`,
				);
				return;
			}

			const args =
				request.params?.arguments &&
				typeof request.params.arguments === "object" &&
				!Array.isArray(request.params.arguments)
					? (request.params.arguments as Record<string, unknown>)
					: {};
			calls.push({
				sessionId: String(request.params?.sessionId),
				name: String(request.params?.name),
				arguments: args,
			});
			const result = {
				generation: 7,
				result: {
					text: "ok",
					images:
						request.params?.name === "get_window_state"
							? [{ mimeType: "image/png", dataBase64: "ZmFrZQ==" }]
							: [],
					structuredJson: JSON.stringify({
						effect: "confirmed",
						provider: request.params?.name,
					}),
					isError: false,
					degraded: false,
					rawJson: "{}",
				},
			};
			if (args.key === "WAIT") {
				setTimeout(() => reply(result), 500);
				return;
			}
			reply(result);
		});
		socket.once("close", () => {
			if (!replied) cancelledConnections += 1;
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(socketPath, () => {
			server.off("error", reject);
			resolve();
		});
	});

	const client = new StdioMcpClient({
		name: "computer-use-probe",
		command: process.execPath,
		args: [path.join(import.meta.dir, "computer-use-mcp.ts")],
		env: [
			{ name: "SUPERSET_ACP_SOURCE_SESSION_ID", value: "session-42" },
			{ name: "SUPERSET_COMPUTER_RUNTIME_BRIDGE_SOCKET", value: socketPath },
			{ name: "SUPERSET_COMPUTER_RUNTIME_BRIDGE_TOKEN", value: token },
		],
	});
	await client.initialize();

	return {
		client,
		calls,
		cancelledConnections: () => cancelledConnections,
		async close() {
			await client.close();
			await new Promise<void>((resolve) => server.close(() => resolve()));
			await rm(root, { recursive: true, force: true });
		},
	};
}

describe("Computer Use MCP process", () => {
	test("exposes Superset-owned tool names and hides provider browser/session details", async () => {
		const f = await fixture();
		try {
			const tools = await f.client.listTools();
			expect(tools.map((tool) => tool.name)).toEqual([
				"computer_apps",
				"computer_see",
				"computer_verify_state",
				"computer_press",
				"computer_window",
				"computer_space",
				"computer_dock",
				"computer_app",
				"computer_paste",
				"computer_dialog",
				"computer_action",
				"computer_permissions",
			]);
			const press = tools.find((tool) => tool.name === "computer_press");
			expect(press?.inputSchema).toMatchObject({
				properties: { key: { type: "string" } },
				required: ["key"],
			});
			expect(JSON.stringify(press?.inputSchema)).not.toContain('"session"');
			expect(tools.some((tool) => tool.name.includes("browser"))).toBe(false);
			expect(tools.some((tool) => tool.name.startsWith("superset_"))).toBe(
				false,
			);
		} finally {
			await f.close();
		}
	});

	test("routes calls through the Superset bridge with session identity outside provider args", async () => {
		const f = await fixture();
		try {
			const result = await f.client.callTool("computer_press", {
				key: "ENTER",
			});
			expect(result.isError).toBe(false);
			expect(result.structuredContent).toEqual({
				effect: "confirmed",
				provider: "press_key",
			});
			expect(result._meta).toMatchObject({
				supersetComputer: {
					generation: 7,
					provider: "desktop-runtime",
					degraded: false,
				},
			});
			expect(f.calls).toEqual([
				{
					sessionId: "session-42",
					name: "press_key",
					arguments: { key: "ENTER" },
				},
			]);
		} finally {
			await f.close();
		}
	});

	test("forwards screenshots without exposing provider-specific tool names", async () => {
		const f = await fixture();
		try {
			const result = await f.client.callTool("computer_see", {
				pid: 42,
				window_id: 7,
			});
			expect(result.content).toEqual([
				{ type: "text", text: "ok" },
				{ type: "image", data: "ZmFrZQ==", mimeType: "image/png" },
			]);
			expect(f.calls[0]).toMatchObject({
				name: "get_window_state",
				arguments: { pid: 42, window_id: 7 },
			});
		} finally {
			await f.close();
		}
	});

	test("cancels the bridge request and leaves the next call usable", async () => {
		const f = await fixture();
		try {
			const controller = new AbortController();
			const pending = f.client.callTool(
				"computer_press",
				{ key: "WAIT" },
				controller.signal,
			);
			for (let index = 0; index < 50 && f.calls.length === 0; index += 1) {
				await new Promise((resolve) => setTimeout(resolve, 2));
			}
			controller.abort();
			await expect(pending).rejects.toThrow(/abort|cancel/i);
			for (
				let index = 0;
				index < 50 && f.cancelledConnections() === 0;
				index += 1
			) {
				await new Promise((resolve) => setTimeout(resolve, 2));
			}
			expect(f.cancelledConnections()).toBeGreaterThanOrEqual(1);

			const permissions = await f.client.callTool("computer_permissions", {});
			expect(permissions.isError).toBe(false);
			expect(permissions.structuredContent).toMatchObject({ ready: true });
		} finally {
			await f.close();
		}
	});

	test("rejects provider browser tools before bridge dispatch", async () => {
		const f = await fixture();
		try {
			await expect(
				f.client.callTool("computer_browser_navigate", {}),
			).rejects.toThrow("not allowed");
			expect(f.calls).toEqual([]);
		} finally {
			await f.close();
		}
	});
});
