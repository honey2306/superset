#!/usr/bin/env bun
import { appendFileSync } from "node:fs";
/** Deterministic offline Codex app-server JSON-RPC fixture for ACP bridge tests. */
import { createInterface } from "node:readline";

const scenario = process.env.CODEX_BRIDGE_SCENARIO ?? "accept";
let approvalId: string | number | null = null;

function send(frame: object): void {
	process.stdout.write(`${JSON.stringify(frame)}\n`);
}

function recordMcpConfig(method: string | undefined, params: unknown): void {
	if (method !== "thread/start" && method !== "thread/resume") return;
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
	recordMcpConfig(frame.method, frame.params);
	if (frame.method === "initialize") {
		send({ id: frame.id, result: { userAgent: "fixture/0.143.0" } });
		return;
	}
	if (frame.method === "thread/start") {
		send({ id: frame.id, result: { thread: { id: "thread-1" } } });
		return;
	}
	if (frame.method === "thread/resume") {
		send({ id: frame.id, result: { thread: { id: "thread-1" } } });
		return;
	}
	if (frame.method === "turn/start") {
		send({ id: frame.id, result: { turn: { id: "turn-1" } } });
		if (scenario === "exit") return process.exit(9);
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
