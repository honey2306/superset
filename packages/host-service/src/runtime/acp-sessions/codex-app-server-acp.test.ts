import { describe, expect, test } from "bun:test";
import path from "node:path";
import type {
	RequestPermissionRequest,
	RequestPermissionResponse,
} from "@superset/session-protocol";
import {
	CodexBridge,
	codexDecisionOptions,
	isCodexBridgeMain,
	selectedCodexDecision,
} from "./codex-app-server-acp";

const FIXTURE = path.join(
	import.meta.dir,
	"../../../test/fixtures/fake-codex-app-server.ts",
);

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

describe("Codex app-server recorded RPC fixture", () => {
	test.each([
		"accept",
		"decline",
	] as const)("forwards %s and completes the matching turn", async (decision) => {
		const restore = withFixture(decision);
		const requests: RequestPermissionResponse[] = [];
		const approvalRequests: RequestPermissionRequest[] = [];
		const bridge = new CodexBridge({
			notify: async () => {},
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
