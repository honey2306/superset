import { describe, expect, test } from "bun:test";
import {
	finishV1PresetDrag,
	getV1PinnedPresetIds,
	getV1PinnedPresetsForRender,
	getV1PresetReorderMutation,
	reorderV1PinnedPresetIds,
	syncV1PinnedPresetIds,
} from "./v1PanesPresetOrder";

type Preset = {
	id: string;
	pinnedToBar?: boolean;
	projectIds?: string[] | null;
};

const preset = (id: string, options: Omit<Preset, "id"> = {}): Preset => ({
	id,
	...options,
});

describe("V1 panes preset order", () => {
	test("syncs to changed server order without retaining duplicate or removed ids", () => {
		const matchedPresets = [preset("project-b"), preset("global-a")];

		expect(
			syncV1PinnedPresetIds(
				["project-a", "project-a", "global-a"],
				matchedPresets,
			),
		).toEqual(["project-b", "global-a"]);
		expect(getV1PinnedPresetIds(matchedPresets)).toEqual([
			"project-b",
			"global-a",
		]);
	});

	test("keeps the visual order while a server refresh arrives during dragging", () => {
		expect(
			syncV1PinnedPresetIds(
				["b", "a", "c"],
				[preset("a"), preset("b"), preset("c")],
				true,
			),
		).toEqual(["b", "a", "c"]);
	});

	test("applies the latest server order after a cancelled drag", () => {
		expect(
			finishV1PresetDrag({
				localPinnedPresetIds: ["b", "a", "c"],
				matchedPresets: [preset("a"), preset("c"), preset("b")],
				didDrop: false,
			}),
		).toEqual(["a", "c", "b"]);
	});

	test("keeps the dropped visual order until persistence refreshes the server", () => {
		expect(
			finishV1PresetDrag({
				localPinnedPresetIds: ["b", "a", "c"],
				matchedPresets: [preset("a"), preset("b"), preset("c")],
				didDrop: true,
			}),
		).toEqual(["b", "a", "c"]);
	});

	test("renders the stable drag member snapshot when server membership changes", () => {
		const dragSnapshot = [preset("a"), preset("b"), preset("c")];
		const refreshedPresets = [preset("a"), preset("c"), preset("d")];

		expect(
			getV1PinnedPresetsForRender({
				localPinnedPresetIds: ["b", "a", "c"],
				matchedPresets: refreshedPresets,
				dragSnapshot,
			}),
		).toEqual([preset("b"), preset("a"), preset("c")]);
	});

	test("does not persist when the dragged preset disappears during drag", () => {
		expect(
			getV1PresetReorderMutation({
				presets: [preset("a"), preset("b"), preset("c")],
				currentMatchedPinnedPresetIds: ["a", "c"],
				pinnedPresetIds: ["b", "a", "c"],
				originalPinnedPresetIds: ["a", "b", "c"],
				presetId: "b",
				originalPinnedIndex: 1,
				targetPinnedIndex: 0,
			}),
		).toBeNull();
	});

	test("does not persist when the drop target disappears during drag", () => {
		expect(
			getV1PresetReorderMutation({
				presets: [preset("a"), preset("b"), preset("c")],
				currentMatchedPinnedPresetIds: ["a", "b"],
				pinnedPresetIds: ["a", "c", "b"],
				originalPinnedPresetIds: ["a", "b", "c"],
				presetId: "b",
				originalPinnedIndex: 1,
				targetPinnedIndex: 2,
			}),
		).toBeNull();
	});

	test("resets to latest membership after cancel before a consecutive drag", () => {
		const afterCancel = finishV1PresetDrag({
			localPinnedPresetIds: ["b", "a", "c"],
			matchedPresets: [preset("a"), preset("c"), preset("d")],
			didDrop: false,
		});

		expect(afterCancel).toEqual(["a", "c", "d"]);
		expect(reorderV1PinnedPresetIds(afterCancel, 2, 0)).toEqual([
			"d",
			"a",
			"c",
		]);
	});

	test("reorders locally on hover without mutating the current ids", () => {
		const current = ["a", "b", "c"];

		expect(reorderV1PinnedPresetIds(current, 0, 2)).toEqual(["b", "c", "a"]);
		expect(current).toEqual(["a", "b", "c"]);
	});

	test("does not persist a drop that finishes at its original position", () => {
		expect(
			getV1PresetReorderMutation({
				presets: [preset("a"), preset("b")],
				pinnedPresetIds: ["a", "b"],
				originalPinnedPresetIds: ["a", "b"],
				presetId: "a",
				originalPinnedIndex: 0,
				targetPinnedIndex: 0,
			}),
		).toBeNull();
	});

	test("maps project-targeted derived order to the full backend target index", () => {
		const presets = [
			preset("global-a"),
			preset("project-a", { projectIds: ["project-1"] }),
			preset("other-project", { projectIds: ["project-2"] }),
			preset("project-b", { projectIds: ["project-1"] }),
			preset("global-b"),
		];

		expect(
			getV1PresetReorderMutation({
				presets,
				pinnedPresetIds: ["project-b", "project-a", "global-a", "global-b"],
				originalPinnedPresetIds: [
					"project-a",
					"project-b",
					"global-a",
					"global-b",
				],
				presetId: "project-b",
				originalPinnedIndex: 1,
				targetPinnedIndex: 0,
			}),
		).toEqual({ presetId: "project-b", targetIndex: 1 });
	});

	test("maps global derived order to its full backend target index", () => {
		const presets = [
			preset("global-a"),
			preset("project-a", { projectIds: ["project-1"] }),
			preset("global-b"),
		];

		expect(
			getV1PresetReorderMutation({
				presets,
				pinnedPresetIds: ["project-a", "global-b", "global-a"],
				originalPinnedPresetIds: ["project-a", "global-a", "global-b"],
				presetId: "global-b",
				originalPinnedIndex: 2,
				targetPinnedIndex: 1,
			}),
		).toEqual({ presetId: "global-b", targetIndex: 0 });
	});
});
