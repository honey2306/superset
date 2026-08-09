import { describe, expect, test } from "bun:test";
import { getPullRequestMenuActions } from "./pullRequestMenuActions";

describe("linked pull request context menu actions", () => {
	test("shows open and remove callbacks for a linked pull request", () => {
		const actions = getPullRequestMenuActions({
			hasLinkedPullRequest: true,
			isPullRequestSuppressed: false,
		});
		const calls: string[] = [];
		const callbacks: Partial<Record<(typeof actions)[number], () => void>> = {
			open: () => calls.push("open"),
			unlink: () => calls.push("unlink"),
		};
		for (const action of actions) callbacks[action]?.();
		expect(actions).toEqual(["open", "unlink"]);
		expect(calls).toEqual(["open", "unlink"]);
	});

	test("shows restore only for a suppressed pull request", () => {
		expect(
			getPullRequestMenuActions({
				hasLinkedPullRequest: false,
				isPullRequestSuppressed: true,
			}),
		).toEqual(["restore"]);
	});

	test("hides actions when no linked or suppressed pull request exists", () => {
		expect(
			getPullRequestMenuActions({
				hasLinkedPullRequest: false,
				isPullRequestSuppressed: false,
			}),
		).toEqual([]);
	});
});
