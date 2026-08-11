import { describe, expect, test } from "bun:test";
import type { HostAgentConfig } from "@superset/host-service/settings";
import type { TerminalPreset } from "@superset/local-db";
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
	test("shows only agents linked from pinned tab-bar presets", () => {
		const preset = (id: string, pinnedToBar = true): TerminalPreset =>
			({
				id,
				name: id,
				commands: [],
				cwd: "",
				pinnedToBar,
			}) as TerminalPreset;
		const result = toAutomationAgentChoices(
			[
				config("claude-config", "claude"),
				config("amp-config", "amp"),
				config("codex-config", "codex"),
			],
			[
				preset("claude"),
				preset("amp", false),
				preset("custom-command"),
				preset("codex"),
			],
		);

		expect(result.map(({ id }) => id)).toEqual([
			"claude-config",
			"codex-config",
		]);
	});
});
