import { describe, expect, test } from "bun:test";
import { buildTerminalFileLinkAction } from "./terminal-file-link-action";

describe("buildTerminalFileLinkAction", () => {
	const link = {
		resolvedPath: "/workspace/src/index.ts",
		isDirectory: false,
		row: 42,
		col: 7,
	};

	test("preserves line and column for external editor links", () => {
		expect(buildTerminalFileLinkAction("external", link, "cursor")).toEqual({
			kind: "external",
			input: {
				path: "/workspace/src/index.ts",
				app: "cursor",
				line: 42,
				column: 7,
			},
		});
	});

	test("keeps file viewer location and new-tab behavior", () => {
		expect(buildTerminalFileLinkAction("newTab", link, "cursor")).toEqual({
			kind: "viewer",
			input: {
				filePath: "/workspace/src/index.ts",
				line: 42,
				column: 7,
				openInNewTab: true,
			},
		});
	});

	test("opens directories externally without inventing a location", () => {
		expect(
			buildTerminalFileLinkAction(
				"pane",
				{ ...link, isDirectory: true, row: undefined, col: undefined },
				"cursor",
			),
		).toEqual({
			kind: "external",
			input: { path: "/workspace/src/index.ts", app: "cursor" },
		});
	});
});
