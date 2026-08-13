import { expect, test } from "bun:test";
import { ACP_AGENT_HARNESS_BY_AGENT_ID } from "@superset/shared/agent-catalog";
import { BUILTIN_TERMINAL_AGENTS } from "@superset/shared/builtin-terminal-agents";
import {
	acpAgentLaunchOptions,
	terminalAgentLaunchOptions,
} from "./agentLaunchOptions";

test("offers every catalog-backed ACP agent with its host harness", () => {
	expect(acpAgentLaunchOptions).toEqual(
		Object.entries(ACP_AGENT_HARNESS_BY_AGENT_ID).map(([agentId, harness]) => ({
			agentId,
			harness,
		})),
	);
});

test("offers every safe builtin terminal agent and never the chat-only agent", () => {
	expect(terminalAgentLaunchOptions.map((option) => option.agentId)).toEqual(
		BUILTIN_TERMINAL_AGENTS.map((agent) => agent.id),
	);
	expect(
		terminalAgentLaunchOptions.map((option) => option.agentId),
	).not.toContain("superset");
});
