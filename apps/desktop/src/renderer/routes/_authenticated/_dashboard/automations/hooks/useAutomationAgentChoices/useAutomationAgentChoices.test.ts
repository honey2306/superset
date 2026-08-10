import { describe, expect, test } from "bun:test";
import type { HostAgentConfig } from "@superset/host-service/settings";
import { toAutomationAgentChoices } from "./useAutomationAgentChoices";

function config(id: string, presetId: string): HostAgentConfig {
	return {
		id,
		presetId,
		iconId: null,
		label: presetId,
		command: presetId,
		args: [],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
		order: 0,
	};
}

describe("toAutomationAgentChoices", () => {
	test("includes every ACP agent when an existing config table predates them", () => {
		expect(toAutomationAgentChoices([])).toEqual([
			{ id: "claude", label: "Claude", iconId: "claude" },
			{ id: "codex", label: "Codex", iconId: "codex" },
			{ id: "pi", label: "Pi", iconId: "pi" },
			{ id: "myflicker", label: "MyFlicker", iconId: "myflicker" },
		]);
	});

	test("keeps only ACP-compatible configs while preserving config IDs", () => {
		const result = toAutomationAgentChoices([
			config("claude-config", "claude"),
			config("amp-config", "amp"),
			config("codex-config", "codex"),
			config("custom-config", "custom"),
			config("pi-config", "pi"),
			config("myflicker-config", "myflicker"),
		]);

		expect(result.map(({ id }) => id)).toEqual([
			"claude-config",
			"codex-config",
			"pi-config",
			"myflicker-config",
		]);
	});
});
