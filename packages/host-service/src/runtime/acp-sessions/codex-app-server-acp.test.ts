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
	codexMcpConfig,
	codexToolUpdate,
	isCodexBridgeMain,
	selectedCodexDecision,
} from "./codex-app-server-acp";

const FIXTURE = path.join(
	import.meta.dir,
	"../../../test/fixtures/fake-codex-app-server.ts",
);

const BROWSER_USE_MCP: McpServer = {
	name: "browser-use",
	command: "/opt/local/bin/browser-use",
	args: ["--cli-mcp"],
	env: [{ name: "BROWSER_USE_PROFILE", value: "Superset" }],
};

function withFixture(scenario: "accept" | "decline" | "exit") {
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

	test("forwards config to new and resumed Codex threads", async () => {
		const restore = withFixture("accept");
		const logPath = path.join(
			mkdtempSync(path.join(os.tmpdir(), "codex-mcp-")),
			"requests.jsonl",
		);
		const previousLog = process.env.CODEX_BRIDGE_MCP_REQUEST_LOG;
		process.env.CODEX_BRIDGE_MCP_REQUEST_LOG = logPath;
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
						config: codexMcpConfig([BROWSER_USE_MCP]),
					}),
				},
				{
					method: "thread/resume",
					params: expect.objectContaining({
						config: codexMcpConfig([BROWSER_USE_MCP]),
					}),
				},
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
});
