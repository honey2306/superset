import { describe, expect, mock, test } from "bun:test";
import { resolvePanesPresetLaunch } from "./resolvePanesPresetLaunch";

describe("resolvePanesPresetLaunch", () => {
	test("launches a built-in agent through the formal host route", async () => {
		const launchAgent = mock(async () => undefined);

		const result = await resolvePanesPresetLaunch(
			{
				terminalId: "terminal-codex",
				agentName: "codex",
				initialCommand: undefined,
				fallbackCommand: "codex --fallback",
			},
			launchAgent,
		);

		expect(launchAgent).toHaveBeenCalledWith({
			terminalId: "terminal-codex",
			agent: "codex",
		});
		expect(result).toEqual({
			initialCommand: undefined,
			usedFormalAgentLaunch: true,
		});
	});

	test("falls back to a terminal command for an unavailable agent", async () => {
		const launchAgent = mock(async () => {
			throw new Error("agent executable not installed");
		});

		const result = await resolvePanesPresetLaunch(
			{
				terminalId: "terminal-missing",
				agentName: "gemini",
				initialCommand: undefined,
				fallbackCommand: "gemini --approval-mode=auto_edit",
			},
			launchAgent,
		);

		expect(result).toEqual({
			initialCommand: "gemini --approval-mode=auto_edit",
			usedFormalAgentLaunch: false,
		});
	});

	test("keeps non-agent presets on createSession initialCommand", async () => {
		const launchAgent = mock(async () => undefined);

		const result = await resolvePanesPresetLaunch(
			{
				terminalId: "terminal-script",
				agentName: undefined,
				initialCommand: "bun run dev",
				fallbackCommand: undefined,
			},
			launchAgent,
		);

		expect(launchAgent).not.toHaveBeenCalled();
		expect(result).toEqual({
			initialCommand: "bun run dev",
			usedFormalAgentLaunch: false,
		});
	});
});
