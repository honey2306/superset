import { describe, expect, test } from "bun:test";
import type { HostAgentConfig } from "@superset/host-service/settings";
import type { TerminalPreset } from "@superset/shared/desktop-types";
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
	const preset = (id: string, pinnedToBar = true): TerminalPreset =>
		({
			id,
			name: id,
			commands: [],
			cwd: "",
			pinnedToBar,
		}) as TerminalPreset;

	test("uses the dynamic pinned preset order as its only list source", () => {
		const result = toAutomationAgentChoices(
			[
				config("first-config", "first-dynamic-agent"),
				config("hidden-config", "hidden-dynamic-agent"),
				config("second-config", "second-dynamic-agent"),
			],
			[
				preset("second-dynamic-agent"),
				preset("hidden-dynamic-agent", false),
				preset("first-dynamic-agent"),
			],
		);

		expect(result.map(({ id }) => id)).toEqual([
			"second-config",
			"first-config",
		]);
	});

	test("reflects dynamic preset additions, removals, and unpinning directly", () => {
		const configs = [
			config("alpha-config", "alpha"),
			config("beta-config", "beta"),
		];
		const initial = [preset("alpha")];
		const added = [...initial, preset("beta")];
		const unpinned = [preset("alpha", false), preset("beta")];

		expect(
			toAutomationAgentChoices(configs, initial).map(({ id }) => id),
		).toEqual(["alpha-config"]);
		expect(
			toAutomationAgentChoices(configs, added).map(({ id }) => id),
		).toEqual(["alpha-config", "beta-config"]);
		expect(
			toAutomationAgentChoices(configs, unpinned).map(({ id }) => id),
		).toEqual(["beta-config"]);
	});

	test("falls back to a pinned bundled MyFlicker preset missing from legacy configs", () => {
		expect(toAutomationAgentChoices([], [preset("myflicker")])).toEqual([
			{ id: "myflicker", label: "MyFlicker", iconId: "myflicker" },
		]);
	});

	test("keeps configured instances over bundled fallbacks and excludes unknown shell presets", () => {
		expect(
			toAutomationAgentChoices(
				[config("myflicker-config", "myflicker")],
				[preset("myflicker"), preset("unknown-shell-preset")],
			),
		).toEqual([
			{
				id: "myflicker-config",
				label: "myflicker",
				iconId: "myflicker",
			},
		]);
	});
});
