import { describe, expect, test } from "bun:test";
import {
	ACP_AGENT_HARNESS_BY_AGENT_ID,
	ACP_AGENT_OPTIONS,
	ACP_HARNESSES,
	getAcpAgentLabel,
	isAcpHarness,
} from "../agent-catalog";
import { taskContractSchema } from "./contracts";

describe("Task uses the existing ACP catalog", () => {
	test("all registered runtime identities are accepted, not just the first two examples", () => {
		expect(ACP_HARNESSES).toEqual(Object.values(ACP_AGENT_HARNESS_BY_AGENT_ID));
		for (const agent of ACP_AGENT_OPTIONS) {
			expect(
				taskContractSchema.parse({ goal: "Example", harness: agent.harness })
					.harness,
			).toBe(agent.harness);
			expect(getAcpAgentLabel(agent.harness)).toBe(agent.label);
			expect(isAcpHarness(agent.harness)).toBe(true);
		}
	});
	test("unknown/terminal-only launch definitions are not silently routed to Pi or mfcli", () => {
		for (const harness of ["custom:terminal", "unknown-acp", null, 42])
			expect(isAcpHarness(harness)).toBe(false);
		expect(() =>
			taskContractSchema.parse({ goal: "Example", harness: "unknown-acp" }),
		).toThrow();
		expect(getAcpAgentLabel("future-runtime")).toBe("future-runtime");
	});
});
