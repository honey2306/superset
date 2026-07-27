import { describe, expect, test } from "bun:test";
import { planV1PanesPresetOpen } from "./planV1PanesPresetOpen";

function makePreset(
	overrides: Partial<{
		commands: string[];
		cwd: string;
		name: string;
	}> = {},
) {
	return {
		id: "preset-1",
		name: overrides.name ?? "claude",
		description: "",
		cwd: overrides.cwd ?? "/repo",
		commands: overrides.commands ?? ["claude"],
		projectIds: null,
	};
}

describe("planV1PanesPresetOpen", () => {
	test("new-tab target plans an addTab with the preset command as initialCommand", () => {
		const plan = planV1PanesPresetOpen(makePreset(), {
			target: "new-tab",
			randomUuid: () => "term-1",
		});
		expect(plan).toEqual({
			kind: "addTab",
			terminalId: "term-1",
			initialCommand: "claude",
			initialCwd: "/repo",
			titleOverride: "claude",
		});
	});

	test("active-tab (split-pane) target plans a splitPane in the active tab", () => {
		const plan = planV1PanesPresetOpen(makePreset(), {
			target: "active-tab",
			activeTabId: "tab-1",
			randomUuid: () => "term-2",
		});
		expect(plan).toEqual({
			kind: "splitPane",
			tabId: "tab-1",
			position: "right",
			terminalId: "term-2",
			initialCommand: "claude",
			initialCwd: "/repo",
			titleOverride: "claude",
		});
	});

	test("multi-command preset joins commands with && as the initialCommand", () => {
		const plan = planV1PanesPresetOpen(
			makePreset({ commands: ["echo hi", "claude"] }),
			{ target: "new-tab", randomUuid: () => "term-3" },
		);
		expect(plan?.initialCommand).toBe("echo hi && claude");
	});

	test("empty-commands preset plans a plain terminal with no initialCommand", () => {
		const plan = planV1PanesPresetOpen(makePreset({ commands: [] }), {
			target: "new-tab",
			randomUuid: () => "term-4",
		});
		expect(plan?.initialCommand).toBeUndefined();
	});

	test("active-tab target with no active tab falls back to addTab", () => {
		const plan = planV1PanesPresetOpen(makePreset(), {
			target: "active-tab",
			activeTabId: null,
			randomUuid: () => "term-5",
		});
		expect(plan?.kind).toBe("addTab");
	});
});
