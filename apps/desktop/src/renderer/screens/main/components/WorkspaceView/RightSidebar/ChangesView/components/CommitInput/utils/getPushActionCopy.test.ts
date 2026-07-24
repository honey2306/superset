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
			labelKey: "v1Changes.push.publishBranch",
			menuLabelKey: "v1Changes.push.publishBranch",
			tooltipKey: "v1Changes.push.publishBranchTooltip",
		});
	});

	test("shows generic push copy for tracked branches without a PR target", () => {
		expect(
			getPushActionCopy({
				hasUpstream: true,
				pushCount: 2,
			}),
		).toEqual({
			labelKey: "v1Changes.push.push",
			menuLabelKey: "v1Changes.push.push",
			tooltipKey: "v1Changes.push.pushCommits",
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
			labelKey: "v1Changes.push.toPR",
			menuLabelKey: "v1Changes.push.toPR",
			tooltipKey: "v1Changes.push.pushCommitsTooltip",
			tooltipValues: {
				count: 1,
				target: "Kitenite:feature/pr-branch",
			},
		});
	});
});
