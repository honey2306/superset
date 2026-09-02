import { describe, expect, test } from "bun:test";
import {
	AGENT_BROWSER_TOOL_DEFINITIONS,
	AGENT_BROWSER_TOOL_NAMES,
	agentBrowserToolInput,
	agentBrowserViewportInput,
} from "./agent-browser";

describe("Agent Browser protocol", () => {
	test("publishes one MCP definition for every accepted tool name", () => {
		expect(AGENT_BROWSER_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual(
			AGENT_BROWSER_TOOL_NAMES,
		);
	});

	test("bounds companion viewport dimensions", () => {
		expect(
			agentBrowserViewportInput.parse({
				sessionId: "session-1",
				width: 980,
				height: 1_420,
			}),
		).toEqual({ sessionId: "session-1", width: 980, height: 1_420 });
		expect(
			agentBrowserViewportInput.safeParse({
				sessionId: "session-1",
				width: 100,
				height: 100,
			}).success,
		).toBe(false);
	});

	test("rejects tools outside the owned Browser surface", () => {
		expect(
			agentBrowserToolInput.safeParse({
				sessionId: "session-1",
				name: "browser_exec",
				arguments: {},
			}).success,
		).toBe(false);
	});
});
