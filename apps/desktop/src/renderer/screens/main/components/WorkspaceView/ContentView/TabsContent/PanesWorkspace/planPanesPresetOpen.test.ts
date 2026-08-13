import { describe, expect, test } from "bun:test";
import { planPanesPresetOpen } from "./planPanesPresetOpen";

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

describe("planPanesPresetOpen", () => {
	test("new-tab target plans a formal host launch for a built-in agent", () => {
		const plan = planPanesPresetOpen(makePreset(), {
			target: "new-tab",
			randomUuid: () => "term-1",
		});
		expect(plan).toEqual({
			kind: "addTab",
			terminalId: "term-1",
			agentName: "claude",
			initialCommand: undefined,
			fallbackCommand: "claude",
			initialCwd: "/repo",
			titleOverride: "claude",
		});
	});

	test("active-tab (split-pane) target plans a splitPane in the active tab", () => {
		const plan = planPanesPresetOpen(makePreset(), {
			target: "active-tab",
			activeTabId: "tab-1",
			randomUuid: () => "term-2",
		});
		expect(plan).toEqual({
			kind: "splitPane",
			tabId: "tab-1",
			position: "right",
			terminalId: "term-2",
			agentName: "claude",
			initialCommand: undefined,
			fallbackCommand: "claude",
			initialCwd: "/repo",
			titleOverride: "claude",
		});
	});

	test("current-pane target plans replacement of the active pane", () => {
		const plan = planPanesPresetOpen(makePreset(), {
			target: "current-pane",
			activeTabId: "tab-1",
			activePaneId: "pane-1",
			randomUuid: () => "term-current",
		});
		expect(plan).toEqual({
			kind: "replacePane",
			tabId: "tab-1",
			paneId: "pane-1",
			terminalId: "term-current",
			agentName: "claude",
			initialCommand: undefined,
			fallbackCommand: "claude",
			initialCwd: "/repo",
			titleOverride: "claude",
		});
	});

	test("non-agent multi-command preset joins commands as initialCommand", () => {
		const plan = planPanesPresetOpen(
			makePreset({ name: "dev", commands: ["echo hi", "bun run dev"] }),
			{ target: "new-tab", randomUuid: () => "term-3" },
		);
		expect(plan?.agentName).toBeUndefined();
		expect(plan?.initialCommand).toBe("echo hi && bun run dev");
		expect(plan?.fallbackCommand).toBeUndefined();
	});

	test("empty-commands preset plans a plain terminal with no initialCommand", () => {
		const plan = planPanesPresetOpen(makePreset({ commands: [] }), {
			target: "new-tab",
			randomUuid: () => "term-4",
		});
		expect(plan?.initialCommand).toBeUndefined();
	});

	test("active-tab target with no active tab falls back to addTab", () => {
		const plan = planPanesPresetOpen(makePreset(), {
			target: "active-tab",
			activeTabId: null,
			randomUuid: () => "term-5",
		});
		expect(plan?.kind).toBe("addTab");
	});
});
