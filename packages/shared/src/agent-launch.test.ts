import { describe, expect, it } from "bun:test";
import {
	type AgentLaunchRequest,
	normalizeAgentLaunchRequest,
} from "./agent-launch";

describe("normalizeAgentLaunchRequest", () => {
	it("returns a canonical terminal request unchanged", () => {
		const request: AgentLaunchRequest = {
			kind: "terminal",
			workspaceId: "ws-1",
			source: "mcp",
			idempotencyKey: "idem-1",
			terminal: { command: "claude", name: "task-123" },
		};
		expect(normalizeAgentLaunchRequest(request)).toEqual(request);
	});

	it("rejects legacy launch payloads", () => {
		expect(() =>
			normalizeAgentLaunchRequest({ workspaceId: "ws-1", command: "codex" }),
		).toThrow();
	});
});
