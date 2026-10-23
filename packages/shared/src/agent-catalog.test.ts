import { expect, test } from "bun:test";
import {
	ACP_AGENT_HARNESS_BY_AGENT_ID,
	type AcpSupportedAgentId,
	BUILTIN_AGENT_IDS,
	USER_VISIBLE_BUILTIN_AGENT_DEFINITIONS,
} from "./agent-catalog";

test("ACP agent harnesses only reference built-in terminal agents", () => {
	for (const agentId of Object.keys(
		ACP_AGENT_HARNESS_BY_AGENT_ID,
	) as AcpSupportedAgentId[]) {
		expect(BUILTIN_AGENT_IDS).toContain(agentId);
		expect(agentId).not.toBe("superset");
	}
});

test("does not register DeepSeek as an agent", () => {
	expect(BUILTIN_AGENT_IDS).not.toContain("deepseek");
	expect(Object.values(ACP_AGENT_HARNESS_BY_AGENT_ID)).not.toContain(
		"deepseek-acp",
	);
	expect(
		USER_VISIBLE_BUILTIN_AGENT_DEFINITIONS.map((agent) => agent.id),
	).not.toContain("deepseek");
});
