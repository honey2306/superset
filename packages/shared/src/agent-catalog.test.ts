import { expect, test } from "bun:test";
import {
	ACP_AGENT_HARNESS_BY_AGENT_ID,
	type AcpSupportedAgentId,
	BUILTIN_AGENT_IDS,
} from "./agent-catalog";

test("ACP agent harnesses only reference built-in terminal agents", () => {
	for (const agentId of Object.keys(
		ACP_AGENT_HARNESS_BY_AGENT_ID,
	) as AcpSupportedAgentId[]) {
		expect(BUILTIN_AGENT_IDS).toContain(agentId);
		expect(agentId).not.toBe("superset");
	}
});
