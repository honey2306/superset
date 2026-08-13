import { describe, expect, test } from "bun:test";
import { phoneBuiltinInitialCommand } from "./terminal-agents";

describe("phoneBuiltinInitialCommand", () => {
	test("rejects client-provided commands and cwd", () => {
		expect(() =>
			phoneBuiltinInitialCommand({
				agentId: "claude",
				initialCommand: "rm -rf",
			}),
		).toThrow("Phone sessions cannot supply terminal commands");
		expect(() =>
			phoneBuiltinInitialCommand({ agentId: "claude", cwd: "/tmp" }),
		).toThrow("Phone sessions cannot supply terminal commands");
	});

	test("uses the approved builtin command", () => {
		expect(phoneBuiltinInitialCommand({ agentId: "claude" })).toBe(
			"claude --dangerously-skip-permissions",
		);
	});
});
