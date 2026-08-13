import { describe, expect, test } from "bun:test";
import { getAgentCommandDetails } from "./agentCommandDetails";

describe("getAgentCommandDetails", () => {
	test("prefers the concrete command and combines available stdout/stderr", () => {
		expect(
			getAgentCommandDetails({
				title: "Run checks",
				rawInput: { command: "bun run test" },
				rawOutput: { stdout: "42 passed", stderr: "warning" },
				status: "completed",
			}),
		).toEqual({
			summary: "Run checks",
			command: "bun run test",
			output: "42 passed\nwarning",
			status: "completed",
		});
	});

	test("uses the agent title as a summary without inventing command output", () => {
		expect(
			getAgentCommandDetails({
				title: "Inspect package metadata",
				rawInput: {},
				rawOutput: { unexpected: true },
				status: "in_progress",
			}),
		).toEqual({
			summary: "Inspect package metadata",
			status: "in_progress",
		});
	});

	test("prefers normalized terminal output and preserves completion facts", () => {
		expect(
			getAgentCommandDetails({
				rawOutput: { stdout: "stale output" },
				terminal: {
					terminalId: "pi-opaque-1",
					output: "59 passed",
					cwd: "/repo",
					exitCode: 0,
					signal: null,
				},
			}),
		).toEqual({
			output: "59 passed",
			cwd: "/repo",
			exitCode: 0,
			signal: null,
		});
	});
});
