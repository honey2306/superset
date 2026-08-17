import { describe, expect, test } from "bun:test";
import type { HostAgentConfig } from "@superset/host-service/settings";
import { toDelegatedExecutionAgentChoices } from "./delegated-execution-agents";

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

describe("delegated execution agent choices", () => {
	test("keeps pinned Pi and MyFlicker alongside other ACP agents", () => {
		const choices = toDelegatedExecutionAgentChoices(
			[
				{ id: "claude-config", label: "Claude" },
				{ id: "pi-config", label: "Pi" },
				{ id: "myflicker-config", label: "MyFlicker" },
				{ id: "gemini-config", label: "Gemini" },
			],
			[
				config("claude-config", "claude"),
				config("pi-config", "pi"),
				config("myflicker-config", "myflicker"),
				config("gemini-config", "gemini"),
			],
		);

		expect(choices.map((choice) => choice.id)).toEqual([
			"claude-config",
			"pi-config",
			"myflicker-config",
		]);
	});
});
