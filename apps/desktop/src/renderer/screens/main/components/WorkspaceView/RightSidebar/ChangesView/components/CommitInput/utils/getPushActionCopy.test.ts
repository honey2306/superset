import { describe, expect, test } from "bun:test";
import { getPushActionCopy } from "./getPushActionCopy";

describe("getPushActionCopy", () => {
	test("shows publish branch copy when no upstream or PR target exists", () => {
		expect(
			getPushActionCopy({
				hasUpstream: false,
				pushCount: 0,
			}),
		).toEqual({
			labelKey: "changes.push.publishBranch",
			menuLabelKey: "changes.push.publishBranch",
			tooltipKey: "changes.push.publishBranchTooltip",
		});
	});

	test("shows generic push copy for tracked branches without a PR target", () => {
		expect(
			getPushActionCopy({
				hasUpstream: true,
				pushCount: 2,
			}),
		).toEqual({
			labelKey: "changes.push.push",
			menuLabelKey: "changes.push.push",
			tooltipKey: "changes.push.pushCommits",
			tooltipValues: { count: 2 },
		});
	});

	test("shows PR-specific push copy when an attached PR target exists", () => {
		expect(
			getPushActionCopy({
				hasUpstream: true,
				pushCount: 1,
				pullRequest: {
					headRefName: "feature/pr-branch",
					headRepositoryOwner: "Kitenite",
				},
			}),
		).toEqual({
			labelKey: "changes.push.toPR",
			menuLabelKey: "changes.push.toPR",
			tooltipKey: "changes.push.pushCommitsTooltip",
			tooltipValues: {
				count: 1,
				target: "Kitenite:feature/pr-branch",
			},
		});
	});
});
