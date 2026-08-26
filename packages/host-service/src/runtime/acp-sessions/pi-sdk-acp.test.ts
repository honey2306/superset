import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import {
	acpUsage,
	extensionUiCustomResponse,
	extensionUiPermissionOptions,
	extractSystemInstructions,
	initializeMcpTools,
	modelRuntimeCreateOptions,
	PiSdkAcpAgent,
	persistNewSessionMarker,
	piToolResultImageBlocks,
	promptFailure,
	promptText,
	sessionResponse,
	shouldReplayTranscript,
	toolKind,
	type UsageSnapshot,
	usageFromMessage,
} from "./pi-sdk-acp";

function testAgent(): {
	agent: PiSdkAcpAgent;
	installRuntime: (prompt: () => Promise<void>) => void;
	updates: unknown[];
} {
	const updates: unknown[] = [];
	const connection = {
		sessionUpdate: async (update: unknown) => {
			updates.push(update);
		},
	} as never;
	const agent = new PiSdkAcpAgent(connection);
	const sessions = (agent as unknown as { sessions: Map<string, unknown> })
		.sessions;
	return {
		agent,
		updates,
		installRuntime: (prompt) => {
			sessions.set("session-1", {
				sessionId: "session-1",
				session: {
					prompt,
					getSessionStats: () => ({
						tokens: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							total: 0,
						},
					}),
				},
				promptActive: false,
				cancelRequested: false,
				assistantMessageId: undefined,
				eventQueue: Promise.resolve(),
			});
		},
	};
}

describe("Pi SDK ACP mappings", () => {
	test("refreshes local provider availability without enabling catalog network IO", () => {
		expect(modelRuntimeCreateOptions()).toEqual({
			allowModelNetwork: false,
			refreshOnCreate: true,
		});
	});

	test("restores configured providers during runtime creation", async () => {
		const credentials = {
			read: async (providerId: string) =>
				providerId === "openai"
					? { type: "api_key", key: "test-key" }
					: undefined,
			list: async () => [{ providerId: "openai", type: "api_key" }],
			modify: async () => undefined,
			delete: async () => undefined,
		};
		const runtime = await ModelRuntime.create({
			...modelRuntimeCreateOptions(),
			credentials: credentials as never,
			modelsPath: null,
		});

		expect(
			runtime
				.getAvailableSnapshot()
				.some((model) => model.provider === "openai"),
		).toBe(true);
	});

	test("initializes independent MCP servers in parallel", async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-sdk-acp-mcp-startup-"));
		const serverPath = join(root, "delayed-mcp.ts");
		writeFileSync(
			serverPath,
			`import readline from "node:readline";
const delayMs = Number(process.argv[2]);
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    setTimeout(() => console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {} })), delayMs);
  } else if (request.method === "tools/list") {
    console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { tools: [] } }));
  }
});
`,
		);
		const startedAt = performance.now();
		const result = await initializeMcpTools([
			{
				name: "first",
				command: process.execPath,
				args: [serverPath, "600"],
				env: [],
			},
			{
				name: "second",
				command: process.execPath,
				args: [serverPath, "600"],
				env: [],
			},
		] as never);
		const elapsedMs = performance.now() - startedAt;
		try {
			expect(result.tools).toHaveLength(0);
			expect(elapsedMs).toBeLessThan(950);
		} finally {
			await Promise.all(result.clients.map((client) => client.close()));
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("persists a new session before an immediate list/load", async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-sdk-acp-session-"));
		const cwd = join(root, "cwd");
		const sessionDir = join(root, "sessions");
		mkdirSync(cwd);
		try {
			const manager = SessionManager.create(cwd, sessionDir);
			persistNewSessionMarker(manager);

			const listed = await SessionManager.list(cwd, sessionDir);
			expect(listed).toHaveLength(1);
			const listedSession = listed[0];
			expect(listedSession?.id).toBe(manager.getSessionId());
			if (!listedSession) throw new Error("Expected persisted Pi session");

			const opened = SessionManager.open(listedSession.path, sessionDir, cwd);
			expect(opened.getSessionId()).toBe(manager.getSessionId());
			expect(
				opened
					.getEntries()
					.some(
						(entry) =>
							entry.type === "custom" &&
							entry.customType === "superset/acp-session",
					),
			).toBe(true);
			expect(opened.buildSessionContext().messages).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("deletes a persisted session outside the last selected cwd", async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-sdk-acp-delete-"));
		const sessionFile = join(root, "foreign-session.jsonl");
		writeFileSync(sessionFile, "session");
		const previousListAll = SessionManager.listAll;
		SessionManager.listAll = (async () => [
			{ id: "foreign-session", path: sessionFile },
		]) as typeof SessionManager.listAll;
		try {
			const agent = testAgent().agent;
			await agent.deleteSession({ sessionId: "foreign-session" });
			expect(existsSync(sessionFile)).toBe(false);
		} finally {
			SessionManager.listAll = previousListAll;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("preserves ACP prompt text while ignoring unsupported blocks", () => {
		expect(
			promptText([
				{ type: "text", text: "Inspect this" },
				{
					type: "resource_link",
					uri: "file:///tmp/example.ts",
					name: "example.ts",
				},
				{ type: "image", data: "abc", mimeType: "image/png" },
			] as never),
		).toBe("Inspect this\nexample.ts\nfile:///tmp/example.ts");
	});

	test("uses stable ACP tool categories for Pi built-ins and MCP tools", () => {
		expect(toolKind("bash")).toBe("execute");
		expect(toolKind("read")).toBe("read");
		expect(toolKind("edit")).toBe("edit");
		expect(toolKind("wait_delegation")).toBe("other");
	});

	test("normalizes and deduplicates images in a serialized MCP tool result", () => {
		const image = {
			type: "image" as const,
			data: "a".repeat(4_096),
			mimeType: "image/png",
		};
		const serialized = JSON.stringify({
			content: [image],
			isError: false,
		});
		const result = {
			content: [{ type: "text", text: serialized }],
			details: {
				mcpResult: { content: [{ type: "text", text: serialized }] },
			},
			artifactPath: "/tmp/pi-tool-result.png",
		};

		const images = piToolResultImageBlocks(result);
		expect(images).toHaveLength(1);
		expect(images[0]).toMatchObject({
			type: "image",
			mimeType: "image/png",
		});
		expect(images[0]?.data).toHaveLength(4_096);
	});

	test("projects tool result images into assistant message chunks", async () => {
		const { agent, updates } = testAgent();
		const image = {
			type: "image" as const,
			data: "b".repeat(4_096),
			mimeType: "image/png",
		};
		const serialized = JSON.stringify({ content: [image], isError: false });
		const result = {
			content: [{ type: "text", text: serialized }],
			details: { mcpResult: { content: [image] } },
		};

		await (
			agent as unknown as {
				handleEvent: (runtime: unknown, event: unknown) => Promise<void>;
			}
		).handleEvent(
			{ sessionId: "session-1", assistantMessageId: "assistant-1" },
			{
				type: "tool_execution_end",
				toolCallId: "tool-1",
				toolName: "mcp_screenshot",
				result,
				isError: false,
			},
		);

		expect(updates).toHaveLength(2);
		expect(updates[0]).toMatchObject({
			sessionId: "session-1",
			update: {
				sessionUpdate: "tool_call_update",
				toolCallId: "tool-1",
				status: "completed",
				rawOutput: result,
			},
		});
		expect(updates[1]).toEqual({
			sessionId: "session-1",
			update: {
				sessionUpdate: "agent_message_chunk",
				messageId: "assistant-1",
				content: image,
			},
		});
	});

	test("maps Pi assistant usage to ACP cumulative usage", () => {
		const usage = usageFromMessage({
			role: "assistant",
			usage: { input: 12, output: 7, cacheRead: 3, cacheWrite: 1 },
		});
		expect(usage).toEqual({
			inputTokens: 12,
			outputTokens: 7,
			cacheRead: 3,
			cacheWrite: 1,
			totalTokens: 23,
		});
		expect(acpUsage(usage)).toEqual({
			totalTokens: 23,
			inputTokens: 12,
			outputTokens: 7,
			cachedReadTokens: 3,
			cachedWriteTokens: 1,
		});
	});

	test("prefers ACP delegation metadata over the compatibility environment", () => {
		const previous = process.env.SUPERSET_PI_ACP_APPEND_SYSTEM_PROMPT;
		process.env.SUPERSET_PI_ACP_APPEND_SYSTEM_PROMPT =
			"environment instructions";
		try {
			expect(
				extractSystemInstructions({
					"sh.superset/delegationInstructions": "metadata instructions",
				}),
			).toBe("metadata instructions");
			expect(extractSystemInstructions({})).toBe("environment instructions");
		} finally {
			if (previous === undefined)
				delete process.env.SUPERSET_PI_ACP_APPEND_SYSTEM_PROMPT;
			else process.env.SUPERSET_PI_ACP_APPEND_SYSTEM_PROMPT = previous;
		}
	});

	test("keeps explicit zero usage values", () => {
		const zero: UsageSnapshot = {
			inputTokens: 0,
			outputTokens: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
		};
		expect(acpUsage(zero)?.totalTokens).toBe(0);
	});

	test("skips persisted transcript replay only when Superset requests it", () => {
		expect(shouldReplayTranscript(undefined)).toBe(true);
		expect(shouldReplayTranscript({})).toBe(true);
		expect(
			shouldReplayTranscript({ "sh.superset/skipTranscriptReplay": true }),
		).toBe(false);
	});

	test("returns a stable ACP session response for new and loaded sessions", () => {
		const configOptions = [
			{
				type: "select" as const,
				id: "model",
				category: "model",
				name: "Model",
				description: null,
				currentValue: "provider/model",
				options: [],
			},
		];
		expect(sessionResponse("session-1", configOptions)).toMatchObject({
			sessionId: "session-1",
			configOptions,
			_meta: { piAcp: { sdk: true, loaded: false, startupInfo: null } },
		});
		expect(sessionResponse("session-1", configOptions, true)._meta).toEqual({
			piAcp: { sdk: true, loaded: true, startupInfo: null },
		});
	});

	test("maps extension UI dialog choices through ACP permission metadata", () => {
		expect(extensionUiPermissionOptions("select", ["One", "Two"])).toEqual([
			{ optionId: "option-0", name: "One", kind: "allow_once" },
			{ optionId: "option-1", name: "Two", kind: "allow_once" },
			{ optionId: "cancel", name: "Cancel", kind: "reject_once" },
		]);
		expect(
			extensionUiCustomResponse({
				outcome: {
					outcome: "selected",
					optionId: "cancel",
					_meta: { "sh.superset/customResponse": "typed answer" },
				},
			}),
		).toBe("typed answer");
		expect(
			extensionUiCustomResponse({ outcome: { outcome: "cancelled" } }),
		).toBeUndefined();
	});

	test("does not duplicate user chunks already broadcast by the host manager", async () => {
		const { agent, installRuntime, updates } = testAgent();
		installRuntime(async () => undefined);

		const response = await agent.prompt({
			sessionId: "session-1",
			prompt: [{ type: "text", text: "hello" }],
		} as never);

		expect(response.stopReason).toBe("end_turn");
		expect(updates).toEqual([]);
	});

	test("surfaces provider failures as ACP request errors", async () => {
		const { agent, installRuntime } = testAgent();
		installRuntime(async () => {
			throw new Error("No configured provider credentials");
		});

		const originalError = console.error;
		console.error = () => {};
		try {
			await expect(
				agent.prompt({
					sessionId: "session-1",
					prompt: [{ type: "text", text: "hello" }],
				} as never),
			).rejects.toMatchObject({
				code: -32603,
				message:
					"Internal error: Pi prompt failed: No configured provider credentials",
			});
		} finally {
			console.error = originalError;
		}
		expect(promptFailure(new Error("provider failed")).code).toBe(-32603);
	});
});
