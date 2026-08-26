#!/usr/bin/env bun
import { appendFileSync } from "node:fs";
/** Deterministic offline Codex app-server JSON-RPC fixture for ACP bridge tests. */
import { createInterface } from "node:readline";

const scenario = process.env.CODEX_BRIDGE_SCENARIO ?? "accept";
const models = [
	{
		id: "gpt-5.6-sol",
		model: "gpt-5.6-sol",
		displayName: "GPT-5.6-Sol",
		description: "Frontier coding model",
		hidden: false,
		isDefault: true,
		defaultReasoningEffort: "low",
		supportedReasoningEfforts: [
			{ reasoningEffort: "low", description: "Fast" },
			{ reasoningEffort: "high", description: "Thorough" },
		],
	},
	{
		id: "gpt-5.6-luna",
		model: "gpt-5.6-luna",
		displayName: "GPT-5.6-Luna",
		description: "Fast coding model",
		hidden: false,
		isDefault: false,
		defaultReasoningEffort: "medium",
		supportedReasoningEfforts: [
			{ reasoningEffort: "low", description: "Fast" },
			{ reasoningEffort: "medium", description: "Balanced" },
		],
	},
];
let approvalId: string | number | null = null;
let currentModel = models[0]?.model ?? "gpt-5.6-sol";
let currentReasoningEffort = models[0]?.defaultReasoningEffort ?? "low";

function send(frame: object): void {
	process.stdout.write(`${JSON.stringify(frame)}\n`);
}

function recordRequest(method: string | undefined, params: unknown): void {
	if (
		method !== "model/list" &&
		method !== "thread/start" &&
		method !== "thread/resume" &&
		method !== "thread/settings/update" &&
		method !== "mcpServer/tool/call"
	) {
		return;
	}
	const logPath = process.env.CODEX_BRIDGE_MCP_REQUEST_LOG;
	if (!logPath) return;
	appendFileSync(logPath, `${JSON.stringify({ method, params })}\n`);
}

createInterface({ input: process.stdin }).on("line", (line) => {
	const frame = JSON.parse(line) as {
		id?: string | number;
		method?: string;
		params?: { threadId?: string; turnId?: string };
	};
	recordRequest(frame.method, frame.params);
	if (frame.method === "initialize") {
		send({ id: frame.id, result: { userAgent: "fixture/0.143.0" } });
		return;
	}
	if (frame.method === "model/list") {
		send({ id: frame.id, result: { data: models, nextCursor: null } });
		return;
	}
	if (frame.method === "thread/start") {
		const requestedModel = (frame.params as { model?: unknown } | undefined)
			?.model;
		currentModel =
			process.env.CODEX_BRIDGE_RETURNED_MODEL ??
			(typeof requestedModel === "string" ? requestedModel : currentModel);
		currentReasoningEffort =
			models.find((model) => model.model === currentModel)
				?.defaultReasoningEffort ?? currentReasoningEffort;
		send({
			id: frame.id,
			result: {
				thread: { id: "thread-1" },
				model: currentModel,
				reasoningEffort: currentReasoningEffort,
			},
		});
		return;
	}
	if (frame.method === "thread/resume") {
		send({
			id: frame.id,
			result: {
				thread: { id: "thread-1" },
				model: currentModel,
				reasoningEffort: currentReasoningEffort,
			},
		});
		return;
	}
	if (frame.method === "thread/settings/update") {
		const settings = frame.params as
			| { model?: unknown; effort?: unknown }
			| undefined;
		if (typeof settings?.model === "string") currentModel = settings.model;
		if (typeof settings?.effort === "string") {
			currentReasoningEffort = settings.effort;
		}
		send({ id: frame.id, result: {} });
		return;
	}
	if (frame.method === "turn/start") {
		send({ id: frame.id, result: { turn: { id: "turn-1" } } });
		if (scenario === "exit") return process.exit(9);
		if (scenario === "mcp-elicitation") {
			send({
				method: "mcpServer/elicitation/request",
				id: 69,
				params: {
					threadId: "thread-1",
					turnId: "turn-1",
					serverName: "superset",
					mode: "form",
					message: "Allow Superset tool call?",
					requestedSchema: { type: "object", properties: {} },
					_meta: { codex_approval_kind: "mcp_tool_call" },
				},
			});
			return;
		}
		if (scenario === "dynamic-tool" || scenario === "dynamic-tool-image") {
			send({
				method: "item/tool/call",
				id: 70,
				params: {
					threadId: "thread-1",
					turnId: "turn-1",
					callId: "dynamic-call-1",
					namespace: "superset",
					tool: "delegate",
					arguments: { task: "fixture delegated task" },
				},
			});
			return;
		}
		if (scenario === "plan") {
			send({
				method: "turn/plan/updated",
				params: {
					threadId: "thread-1",
					turnId: "turn-1",
					explanation: "Reviewing the implementation path.",
					plan: [
						{ step: "Inspect repository", status: "completed" },
						{ step: "Implement fix", status: "inProgress" },
					],
				},
			});
			send({
				method: "item/completed",
				params: {
					threadId: "thread-1",
					turnId: "turn-1",
					item: {
						id: "plan-1",
						type: "plan",
						text: "proposal-only plan: inspect, implement, verify",
					},
				},
			});
			send({
				method: "turn/completed",
				params: {
					threadId: "thread-1",
					turn: { id: "turn-1", status: "completed" },
				},
			});
			return;
		}
		send({
			method: "item/started",
			params: {
				threadId: "thread-1",
				turnId: "turn-1",
				item: { id: "compaction-1", type: "contextCompaction" },
			},
		});
		send({
			method: "item/completed",
			params: {
				threadId: "thread-1",
				turnId: "turn-1",
				item: {
					id: "compaction-1",
					type: "contextCompaction",
					status: "completed",
				},
			},
		});
		send({
			method: "thread/compacted",
			params: { threadId: "thread-1", turnId: "turn-1" },
		});
		send({
			method: "thread/compacted",
			params: { threadId: "thread-1", turnId: "legacy-turn" },
		});
		send({
			method: "thread/tokenUsage/updated",
			params: {
				threadId: "thread-1",
				turnId: "turn-1",
				tokenUsage: {
					last: {
						inputTokens: 40_000,
						cachedInputTokens: 20_000,
						outputTokens: 1_000,
						reasoningOutputTokens: 500,
						totalTokens: 41_500,
					},
					total: {
						inputTokens: 120_000,
						cachedInputTokens: 60_000,
						outputTokens: 3_000,
						reasoningOutputTokens: 1_500,
						totalTokens: 124_500,
					},
					modelContextWindow: 200_000,
				},
			},
		});
		send({
			method: "item/started",
			params: {
				threadId: "thread-1",
				turnId: "turn-1",
				item: {
					type: "commandExecution",
					id: "call-1",
					command: "touch approved.txt",
					status: "inProgress",
				},
			},
		});
		approvalId = 0;
		send({
			method: "item/commandExecution/requestApproval",
			id: approvalId,
			params: {
				threadId: "thread-1",
				turnId: "turn-1",
				itemId: "call-1",
				reason: "Approve fixture",
				availableDecisions: ["accept", "decline", "cancel"],
			},
		});
		return;
	}
	if (frame.method === "mcpServer/tool/call") {
		recordRequest(frame.method, frame.params);
		send({
			id: frame.id,
			result: {
				content:
					scenario === "dynamic-tool-image"
						? [
								{ type: "text", text: "fixture delegated result" },
								{
									type: "image",
									data: Buffer.from("fake-codex-image").toString("base64"),
									mimeType: "image/png",
								},
							]
						: [{ type: "text", text: "fixture delegated result" }],
				isError: false,
			},
		});
		return;
	}
	if (frame.id === 70) {
		const logPath = process.env.CODEX_BRIDGE_MCP_REQUEST_LOG;
		if (logPath) {
			appendFileSync(
				logPath,
				`${JSON.stringify({ method: "item/tool/call.response", params: frame.result })}\n`,
			);
		}
		send({
			method: "turn/completed",
			params: {
				threadId: "thread-1",
				turn: { id: "turn-1", status: "completed" },
			},
		});
		return;
	}
	if (frame.id === 69) {
		send({
			method: "turn/completed",
			params: {
				threadId: "thread-1",
				turn: { id: "turn-1", status: "completed" },
			},
		});
		return;
	}
	if (frame.id === approvalId) {
		const decision = (frame as { result?: { decision?: string } }).result
			?.decision;
		send({
			method: "item/completed",
			params: {
				threadId: "thread-1",
				turnId: "turn-1",
				item: {
					type: "commandExecution",
					id: "call-1",
					command: "touch approved.txt",
					status: decision === "accept" ? "completed" : "declined",
				},
			},
		});
		send({
			method: "turn/completed",
			params: {
				threadId: "thread-1",
				turn: { id: "turn-1", status: "completed" },
			},
		});
	}
});
