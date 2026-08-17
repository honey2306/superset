import { describe, expect, test } from "bun:test";
import { mergeAcpPaneTitles, resolveAcpStatusBarTitle } from "./acpPaneTitles";

describe("ACP pane titles", () => {
	test("keeps the first agent title for the tab and updates the status title", () => {
		const first = mergeAcpPaneTitles({}, "Initial task");
		expect(first).toEqual({
			title: "Initial task",
			statusTitle: "Initial task",
		});

		const next = mergeAcpPaneTitles(first, "Running tests");
		expect(next).toEqual({
			title: "Initial task",
			statusTitle: "Running tests",
		});

		expect(mergeAcpPaneTitles(next, null)).toEqual({
			title: "Initial task",
			statusTitle: undefined,
		});
		expect(mergeAcpPaneTitles({ title: "   " }, "Meaningful title")).toEqual({
			title: "Meaningful title",
			statusTitle: "Meaningful title",
		});
	});

	test("shows the latest agent title in the status bar without changing the tab fallback", () => {
		expect(
			resolveAcpStatusBarTitle({
				title: "Initial task",
				statusTitle: "Editing files",
				latestUserMessage: "Please fix the bug",
			}),
		).toBe("Editing files");
		expect(
			resolveAcpStatusBarTitle({
				title: "Initial task",
				latestUserMessage: "Please fix the bug",
			}),
		).toBe("Please fix the bug");
		expect(resolveAcpStatusBarTitle({ title: "Initial task" })).toBe(
			"Initial task",
		);
	});
});
