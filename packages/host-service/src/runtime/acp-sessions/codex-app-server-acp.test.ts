import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@agentclientprotocol/sdk";
import type {
	RequestPermissionRequest,
	RequestPermissionResponse,
	SessionUpdate,
} from "@superset/session-protocol";
import {
	CodexBridge,
	codexDecisionOptions,
	codexDynamicToolCallResponse,
	codexMcpConfig,
	codexPlanUpdate,
	codexThreadConfig,
	codexThreadExecutionPolicy,
	codexToolUpdate,
	isCodexBridgeMain,
	selectedCodexDecision,
} from "./codex-app-server-acp";

const FIXTURE = path.join(
	import.meta.dir,
	"../../../test/fixtures/fake-codex-app-server.ts",
);

describe("codexThreadExecutionPolicy", () => {
	test("gives delegated executors unattended full access", () => {
		expect(codexThreadExecutionPolicy("delegated-executor")).toEqual({
			approvalPolicy: "never",
			sandbox: "danger-full-access",
		});
	});

	test("keeps ordinary sessions approval-gated and workspace-scoped", () => {
		expect(codexThreadExecutionPolicy("root-coordinator")).toEqual({
			approvalPolicy: "on-request",
			sandbox: "workspace-write",
		});
	});
});

const BROWSER_USE_MCP: McpServer = {
	name: "browser-use",
	command: "/opt/local/bin/browser-use",
	args: ["--cli-mcp"],
	env: [{ name: "BROWSER_USE_PROFILE", value: "Superset" }],
};

function withFixture(
	scenario:
		| "accept"
		| "decline"
		| "exit"
		| "plan"
		| "dynamic-tool"
		| "dynamic-tool-image"
		| "mcp-elicitation",
) {
	const previousCommand = process.env.CODEX_APP_SERVER_COMMAND;
	const previousScenario = process.env.CODEX_BRIDGE_SCENARIO;
	process.env.CODEX_APP_SERVER_COMMAND = FIXTURE;
	process.env.CODEX_BRIDGE_SCENARIO = scenario;
	return () => {
		if (previousCommand === undefined)
			delete process.env.CODEX_APP_SERVER_COMMAND;
		else process.env.CODEX_APP_SERVER_COMMAND = previousCommand;
		if (previousScenario === undefined)
			delete process.env.CODEX_BRIDGE_SCENARIO;
		else process.env.CODEX_BRIDGE_SCENARIO = previousScenario;
	};
}

describe("isCodexBridgeMain", () => {
	test("recognizes direct Node execution when import.meta.main is unavailable", () => {
		expect(
			isCodexBridgeMain(
				"file:///tmp/codex-app-server-acp.js",
				"/tmp/codex-app-server-acp.js",
				undefined,
			),
		).toBe(true);
	});

	test("does not start the server when imported by a test or another module", () => {
		expect(
			isCodexBridgeMain(
				"file:///tmp/codex-app-server-acp.js",
				"/tmp/test-runner.js",
				false,
			),
		).toBe(false);
	});
});

describe("Codex app-server approval decisions", () => {
	const options = codexDecisionOptions([
		"accept",
		{ acceptWithExecpolicyAmendment: { execpolicy_amendment: ["touch", "a"] } },
		"decline",
		"cancel",
	]);

	test("returns the exact offered accept value", () => {
		expect(
			selectedCodexDecision(
				{
					outcome: { outcome: "selected", optionId: "accept" },
				} as RequestPermissionResponse,
				options,
			),
		).toBe("accept");
		expect(
			selectedCodexDecision(
				{
					outcome: {
						outcome: "selected",
						optionId: "acceptWithExecpolicyAmendment",
					},
				} as RequestPermissionResponse,
				options,
			),
		).toEqual({
			acceptWithExecpolicyAmendment: { execpolicy_amendment: ["touch", "a"] },
		});
	});

	test("never converts a denied or unknown selection into approval", () => {
		expect(
			selectedCodexDecision(
				{
					outcome: { outcome: "selected", optionId: "decline" },
				} as RequestPermissionResponse,
				options,
			),
		).toBe("decline");
		expect(
			selectedCodexDecision(
				{
					outcome: { outcome: "selected", optionId: "missing" },
				} as RequestPermissionResponse,
				options,
			),
		).toBe("cancel");
		expect(
			selectedCodexDecision(
				{ outcome: { outcome: "cancelled" } } as RequestPermissionResponse,
				options,
			),
		).toBe("cancel");
	});
});

describe("Codex app-server MCP forwarding", () => {
	test("forwards MCP tool approval elicitations through ACP permission", async () => {
		const restore = withFixture("mcp-elicitation");
		const requests: RequestPermissionRequest[] = [];
		const bridge = new CodexBridge({
			notify: async () => {},
			request: async (_method, params) => {
				requests.push(params);
				return {
					outcome: { outcome: "selected", optionId: "allow_once" },
				} as RequestPermissionResponse;
			},
		});
		try {
			await bridge.newSession(process.cwd());
			await expect(
				bridge.prompt([{ type: "text", text: "approve MCP" }]),
			).resolves.toEqual({ stopReason: "end_turn" });
			expect(requests).toHaveLength(1);
			expect(requests[0]).toMatchObject({
				toolCall: { title: "Allow Superset tool call?", status: "pending" },
				options: [
					{ optionId: "allow_once", kind: "allow_once" },
					{ optionId: "allow_session", kind: "allow_always" },
					{ optionId: "decline", kind: "reject_once" },
				],
			});
		} finally {
			restore();
		}
	});

	test("disables native subagents when Superset role instructions are present", () => {
		expect(codexThreadConfig([BROWSER_USE_MCP], true)).toEqual({
			...codexMcpConfig([BROWSER_USE_MCP]),
			features: { multi_agent: false },
		});
		expect(codexThreadConfig([], false)).toBeUndefined();
	});

	test("round-trips item/tool/call through mcpServer/tool/call", async () => {
		const restore = withFixture("dynamic-tool");
		const logPath = path.join(
			mkdtempSync(path.join(os.tmpdir(), "codex-dynamic-tool-")),
			"requests.jsonl",
		);
		const previousLog = process.env.CODEX_BRIDGE_MCP_REQUEST_LOG;
		process.env.CODEX_BRIDGE_MCP_REQUEST_LOG = logPath;
		try {
			const bridge = new CodexBridge({
				notify: async () => {},
				request: async () =>
					({ outcome: { outcome: "cancelled" } }) as RequestPermissionResponse,
			});
			await bridge.newSession(process.cwd());
			await expect(
				bridge.prompt([{ type: "text", text: "run the fixture" }]),
			).resolves.toEqual({ stopReason: "end_turn" });

			const requests = readFileSync(logPath, "utf8")
				.trim()
				.split("\n")
				.map(
					(line) =>
						JSON.parse(line) as {
							method: string;
							params: Record<string, unknown>;
						},
				)
				.filter((request) => request.method.includes("tool/call"));
			expect(requests).toContainEqual({
				method: "mcpServer/tool/call",
				params: {
					threadId: "thread-1",
					server: "superset",
					tool: "delegate",
					arguments: { task: "fixture delegated task" },
				},
			});
			expect(requests).toContainEqual({
				method: "item/tool/call.response",
				params: {
					contentItems: [
						{ type: "inputText", text: "fixture delegated result" },
					],
					success: true,
				},
			});
		} finally {
			if (previousLog === undefined)
				delete process.env.CODEX_BRIDGE_MCP_REQUEST_LOG;
			else process.env.CODEX_BRIDGE_MCP_REQUEST_LOG = previousLog;
			restore();
		}
	});

	test("projects dynamic MCP images into an ACP tool update", async () => {
		const restore = withFixture("dynamic-tool-image");
		const updates: SessionUpdate[] = [];
		const bridge = new CodexBridge({
			notify: async (_method, params) => {
				updates.push(params.update);
			},
			request: async () =>
				({ outcome: { outcome: "cancelled" } }) as RequestPermissionResponse,
		});
		try {
			await bridge.newSession(process.cwd());
			await expect(
				bridge.prompt([{ type: "text", text: "run the image fixture" }]),
			).resolves.toEqual({ stopReason: "end_turn" });

			expect(updates).toContainEqual({
				sessionUpdate: "tool_call",
				toolCallId: "dynamic-call-1",
				title: "superset/delegate",
				kind: "other",
				status: "in_progress",
				rawInput: { task: "fixture delegated task" },
			});
			expect(updates).toContainEqual({
				sessionUpdate: "tool_call_update",
				toolCallId: "dynamic-call-1",
				status: "completed",
				rawOutput: {
					content: [
						{ type: "text", text: "fixture delegated result" },
						{
							type: "image",
							data: Buffer.from("fake-codex-image").toString("base64"),
							mimeType: "image/png",
						},
					],
					isError: false,
				},
			});
		} finally {
			restore();
		}
	});

	test("converts MCP content blocks to Codex dynamic response items", () => {
		expect(
			codexDynamicToolCallResponse({
				content: [
					{ type: "text", text: "hello" },
					{ type: "image", mimeType: "image/png", data: "abc" },
					{ type: "audio", mimeType: "audio/wav", data: "def" },
				],
				isError: false,
			}),
		).toEqual({
			contentItems: [
				{ type: "inputText", text: "hello" },
				{ type: "inputImage", imageUrl: "data:image/png;base64,abc" },
				{
					type: "inputText",
					text: JSON.stringify({
						type: "audio",
						mimeType: "audio/wav",
						data: "def",
					}),
				},
			],
			success: true,
		});
		expect(codexDynamicToolCallResponse(null, "tool failed")).toEqual({
			contentItems: [{ type: "inputText", text: "tool failed" }],
			success: false,
		});
	});

	test("translates ACP stdio MCP servers into per-thread Codex config", () => {
		expect(codexMcpConfig([BROWSER_USE_MCP])).toEqual({
			mcp_servers: {
				"browser-use": {
					command: "/opt/local/bin/browser-use",
					args: ["--cli-mcp"],
					env: { BROWSER_USE_PROFILE: "Superset" },
				},
			},
		});
	});

	test("forwards config and delegated execution policy to new and resumed Codex threads", async () => {
		const restore = withFixture("accept");
		const logPath = path.join(
			mkdtempSync(path.join(os.tmpdir(), "codex-mcp-")),
			"requests.jsonl",
		);
		const previousLog = process.env.CODEX_BRIDGE_MCP_REQUEST_LOG;
		const previousRole = process.env.SUPERSET_ACP_SESSION_ROLE;
		process.env.CODEX_BRIDGE_MCP_REQUEST_LOG = logPath;
		process.env.SUPERSET_ACP_SESSION_ROLE = "delegated-executor";
		try {
			const client = {
				notify: async () => {},
				request: async () =>
					({ outcome: { outcome: "cancelled" } }) as RequestPermissionResponse,
			};
			const started = new CodexBridge(client);
			await started.newSession(process.cwd(), [BROWSER_USE_MCP]);
			const resumed = new CodexBridge(client);
			await resumed.loadSession("thread-1", process.cwd(), [BROWSER_USE_MCP]);

			const requests = readFileSync(logPath, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as { method: string; params: unknown })
				.filter(
					(request) =>
						request.method === "thread/start" ||
						request.method === "thread/resume",
				);
			expect(requests).toEqual([
				{
					method: "thread/start",
					params: expect.objectContaining({
						approvalPolicy: "never",
						config: codexMcpConfig([BROWSER_USE_MCP]),
						sandbox: "danger-full-access",
					}),
				},
				{
					method: "thread/resume",
					params: expect.objectContaining({
						approvalPolicy: "never",
						config: codexMcpConfig([BROWSER_USE_MCP]),
						sandbox: "danger-full-access",
					}),
				},
			]);
		} finally {
			if (previousLog === undefined)
				delete process.env.CODEX_BRIDGE_MCP_REQUEST_LOG;
			else process.env.CODEX_BRIDGE_MCP_REQUEST_LOG = previousLog;
			if (previousRole === undefined)
				delete process.env.SUPERSET_ACP_SESSION_ROLE;
			else process.env.SUPERSET_ACP_SESSION_ROLE = previousRole;
			restore();
		}
	});

	test("forwards parent coordination instructions as developer instructions", async () => {
		const restore = withFixture("accept");
		const logPath = path.join(
			mkdtempSync(path.join(os.tmpdir(), "codex-developer-instructions-")),
			"requests.jsonl",
		);
		const previousLog = process.env.CODEX_BRIDGE_MCP_REQUEST_LOG;
		process.env.CODEX_BRIDGE_MCP_REQUEST_LOG = logPath;
		const instructions = "Use Superset delegate before substantial changes.";
		try {
			const client = {
				notify: async () => {},
				request: async () =>
					({ outcome: { outcome: "cancelled" } }) as RequestPermissionResponse,
			};
			const started = new CodexBridge(client);
			await started.newSession(
				process.cwd(),
				[],
				undefined,
				false,
				instructions,
			);
			const resumed = new CodexBridge(client);
			await resumed.loadSession("thread-1", process.cwd(), [], instructions);

			const requests = readFileSync(logPath, "utf8")
				.trim()
				.split("\n")
				.map(
					(line) =>
						JSON.parse(line) as {
							method: string;
							params: Record<string, unknown>;
						},
				)
				.filter(
					(request) =>
						request.method === "thread/start" ||
						request.method === "thread/resume",
				);
			expect(
				requests.map((request) => request.params.developerInstructions),
			).toEqual([instructions, instructions]);
			expect(requests.map((request) => request.params.config)).toEqual([
				{ features: { multi_agent: false } },
				{ features: { multi_agent: false } },
			]);
		} finally {
			if (previousLog === undefined)
				delete process.env.CODEX_BRIDGE_MCP_REQUEST_LOG;
			else process.env.CODEX_BRIDGE_MCP_REQUEST_LOG = previousLog;
			restore();
		}
	});

	test("exposes the Codex model catalog and reasoning controls", async () => {
		const restore = withFixture("accept");
		const logPath = path.join(
			mkdtempSync(path.join(os.tmpdir(), "codex-config-")),
			"requests.jsonl",
		);
		const previousLog = process.env.CODEX_BRIDGE_MCP_REQUEST_LOG;
		process.env.CODEX_BRIDGE_MCP_REQUEST_LOG = logPath;
		try {
			const bridge = new CodexBridge({
				notify: async () => {},
				request: async () =>
					({ outcome: { outcome: "cancelled" } }) as RequestPermissionResponse,
			});
			await bridge.newSession(process.cwd());

			expect(bridge.configOptions()).toMatchObject([
				{
					id: "model",
					currentValue: "gpt-5.6-sol",
					options: [
						{ value: "gpt-5.6-sol", name: "GPT-5.6-Sol" },
						{ value: "gpt-5.6-luna", name: "GPT-5.6-Luna" },
					],
				},
				{
					id: "reasoning_effort",
					currentValue: "low",
					options: [
						{ value: "low", name: "Low" },
						{ value: "high", name: "High" },
					],
				},
			]);

			await bridge.setConfigOption("reasoning_effort", "high");
			await bridge.setConfigOption("model", "gpt-5.6-luna");
			expect(bridge.configOptions()).toMatchObject([
				{ id: "model", currentValue: "gpt-5.6-luna" },
				{ id: "reasoning_effort", currentValue: "medium" },
			]);

			const settingsUpdates = readFileSync(logPath, "utf8")
				.trim()
				.split("\n")
				.map(
					(line) =>
						JSON.parse(line) as {
							method: string;
							params: Record<string, unknown>;
						},
				)
				.filter((request) => request.method === "thread/settings/update");
			expect(settingsUpdates.map((request) => request.params)).toEqual([
				{ threadId: "thread-1", effort: "high" },
				{
					threadId: "thread-1",
					model: "gpt-5.6-luna",
					effort: "medium",
				},
			]);
		} finally {
			if (previousLog === undefined)
				delete process.env.CODEX_BRIDGE_MCP_REQUEST_LOG;
			else process.env.CODEX_BRIDGE_MCP_REQUEST_LOG = previousLog;
			restore();
		}
	});

	test("passes the requested model at thread creation and requires the app-server to confirm it", async () => {
		const restore = withFixture("accept");
		const logPath = path.join(
			mkdtempSync(path.join(os.tmpdir(), "codex-model-")),
			"requests.jsonl",
		);
		const previousLog = process.env.CODEX_BRIDGE_MCP_REQUEST_LOG;
		process.env.CODEX_BRIDGE_MCP_REQUEST_LOG = logPath;
		try {
			const bridge = new CodexBridge({
				notify: async () => {},
				request: async () =>
					({ outcome: { outcome: "cancelled" } }) as RequestPermissionResponse,
			});
			await expect(
				bridge.newSession(process.cwd(), [], "gpt-5.6-sol", true),
			).resolves.toBe("thread-1");
			expect(
				bridge.configOptions().find((option) => option.id === "model"),
			).toMatchObject({ id: "model", currentValue: "gpt-5.6-sol" });
			expect(
				await bridge.setConfigOption("model", "gpt-5.6-sol"),
			).toMatchObject({
				configOptions: [
					{ id: "model", currentValue: "gpt-5.6-sol" },
					{ id: "reasoning_effort", currentValue: "low" },
				],
			});
			const request = readFileSync(logPath, "utf8")
				.trim()
				.split("\n")
				.map(
					(line) =>
						JSON.parse(line) as {
							method: string;
							params: Record<string, unknown>;
						},
				)
				.find((entry) => entry.method === "thread/start");
			expect(request?.params.model).toBe("gpt-5.6-sol");
		} finally {
			if (previousLog === undefined)
				delete process.env.CODEX_BRIDGE_MCP_REQUEST_LOG;
			else process.env.CODEX_BRIDGE_MCP_REQUEST_LOG = previousLog;
			restore();
		}
	});

	test("rejects strict creation when Codex confirms a different model", async () => {
		const restore = withFixture("accept");
		const previousModel = process.env.CODEX_BRIDGE_RETURNED_MODEL;
		process.env.CODEX_BRIDGE_RETURNED_MODEL = "gpt-5.5";
		try {
			const bridge = new CodexBridge({
				notify: async () => {},
				request: async () =>
					({ outcome: { outcome: "cancelled" } }) as RequestPermissionResponse,
			});
			await expect(
				bridge.newSession(process.cwd(), [], "gpt-5.6-sol", true),
			).rejects.toThrow('did not confirm required model "gpt-5.6-sol"');
		} finally {
			if (previousModel === undefined)
				delete process.env.CODEX_BRIDGE_RETURNED_MODEL;
			else process.env.CODEX_BRIDGE_RETURNED_MODEL = previousModel;
			restore();
		}
	});
});

describe("Codex subagent projection", () => {
	test.each([
		"collabAgentToolCall",
		"collab_tool_call",
	])("tags %s items with the provider-neutral semantic contract", (type) => {
		const update = codexToolUpdate({
			id: "spawn-1",
			type,
			tool: "spawn_agent",
			status: "completed",
			prompt: "Inspect repository",
			model: "explorer",
			receiverThreadIds: ["child-1"],
		});
		expect(update).toMatchObject({
			title: "spawn_agent",
			rawInput: {
				prompt: "Inspect repository",
				model: "explorer",
			},
			_meta: {
				"sh.superset/toolSemantic": {
					kind: "subagent",
					task: "Inspect repository",
					agentType: "explorer",
				},
			},
		});
	});

	test.each([
		"wait",
		"send_input",
		"close_agent",
		"resume_agent",
	])("keeps the %s collaboration control as an ordinary tool", (tool) => {
		const update = codexToolUpdate({
			id: `${tool}-1`,
			type: "collabAgentToolCall",
			tool,
			status: "completed",
		});
		expect(update._meta).toBeUndefined();
	});
});

describe("Codex plan projection", () => {
	test("maps app-server plan statuses into ACP plan entries", () => {
		expect(
			codexPlanUpdate({
				plan: [
					{ step: "Inspect repository", status: "completed" },
					{ step: "Implement fix", status: "inProgress" },
					{ step: "Run tests", status: "pending" },
				],
				explanation: "Checking the current implementation first.",
			}),
		).toEqual({
			sessionUpdate: "plan",
			entries: [
				{
					content: "Inspect repository",
					priority: "medium",
					status: "completed",
				},
				{
					content: "Implement fix",
					priority: "medium",
					status: "in_progress",
				},
				{
					content: "Run tests",
					priority: "medium",
					status: "pending",
				},
			],
			_meta: {
				"sh.superset/codexPlanExplanation":
					"Checking the current implementation first.",
			},
		});
	});
});

describe("Codex app-server recorded RPC fixture", () => {
	test.each([
		"accept",
		"decline",
	] as const)("forwards %s and completes the matching turn", async (decision) => {
		const restore = withFixture(decision);
		const requests: RequestPermissionResponse[] = [];
		const approvalRequests: RequestPermissionRequest[] = [];
		const updates: SessionUpdate[] = [];
		const bridge = new CodexBridge({
			notify: async (_method, params) => {
				updates.push(params.update);
			},
			request: async (_method, params) => {
				approvalRequests.push(params);
				const response = {
					outcome: { outcome: "selected", optionId: decision },
				} as RequestPermissionResponse;
				requests.push(response);
				return response;
			},
		});
		try {
			expect(await bridge.newSession(process.cwd())).toBe("thread-1");
			expect(await bridge.prompt([{ type: "text", text: "fixture" }])).toEqual({
				stopReason: "end_turn",
			});
			expect(requests).toHaveLength(1);
			expect(updates).toContainEqual({
				sessionUpdate: "usage_update",
				used: 41_500,
				size: 200_000,
			});
			expect(updates).toContainEqual({
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: "Compacting context..." },
			});
			expect(
				updates.filter(
					(update) =>
						update.sessionUpdate === "agent_message_chunk" &&
						update.content.type === "text" &&
						update.content.text === "Context compacted.",
				),
			).toHaveLength(2);
			expect(approvalRequests[0]?.toolCall).toMatchObject({
				title: "touch approved.txt",
				rawInput: { command: "touch approved.txt" },
			});
		} finally {
			restore();
		}
	});

	test("rejects the active turn when the child exits", async () => {
		const restore = withFixture("exit");
		const bridge = new CodexBridge({
			notify: async () => {},
			request: async () => ({ outcome: { outcome: "cancelled" } }),
		});
		try {
			await bridge.newSession(process.cwd());
			await expect(
				bridge.prompt([{ type: "text", text: "fixture" }]),
			).rejects.toThrow("exited");
		} finally {
			restore();
		}
	});

	test("renders a Codex plan update as structured ACP content", async () => {
		const restore = withFixture("plan");
		const updates: SessionUpdate[] = [];
		const bridge = new CodexBridge({
			notify: async (_method, params) => {
				updates.push(params.update);
			},
			request: async () => ({ outcome: { outcome: "cancelled" } }),
		});
		try {
			await bridge.newSession(process.cwd());
			await expect(
				bridge.prompt([{ type: "text", text: "show the plan" }]),
			).resolves.toEqual({ stopReason: "end_turn" });

			const plan = updates.find((update) => update.sessionUpdate === "plan");
			expect(plan).toMatchObject({
				sessionUpdate: "plan",
				entries: [
					{ content: "Inspect repository", status: "completed" },
					{ content: "Implement fix", status: "in_progress" },
				],
			});
			expect(
				updates.some(
					(update) =>
						update.sessionUpdate === "agent_message_chunk" &&
						update.content.type === "text" &&
						update.content.text.includes("proposal-only plan"),
				),
			).toBe(true);
		} finally {
			restore();
		}
	});
});
