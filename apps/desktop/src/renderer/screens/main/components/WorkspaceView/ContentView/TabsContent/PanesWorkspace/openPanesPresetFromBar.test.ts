import { describe, expect, mock, test } from "bun:test";
import type { TerminalPreset } from "@superset/shared/desktop-types";
import { openPanesPresetFromBar } from "./openPanesPresetFromBar";

const preset = {
	id: "preset-1",
	name: "dev",
	commands: ["bun run dev"],
	cwd: "/repo",
} as TerminalPreset;

describe("openPanesPresetFromBar", () => {
	test("maps the current-pane menu action to the current-pane opener target", async () => {
		const openPreset = mock(async () => {});

		await openPanesPresetFromBar({ openPreset }, preset, "current-pane");

		expect(openPreset).toHaveBeenCalledWith(preset, {
			target: "current-pane",
		});
	});

	test("keeps the default and new-tab actions mapped to new-tab", async () => {
		const openPreset = mock(async () => {});

		await openPanesPresetFromBar({ openPreset }, preset, "new-tab");

		expect(openPreset).toHaveBeenCalledWith(preset, { target: "new-tab" });
	});
});
