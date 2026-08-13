import { describe, expect, test } from "bun:test";
import { getPrimaryAction } from "./getPrimaryAction";
import { getPushActionCopy } from "./getPushActionCopy";

describe("getPrimaryAction", () => {
	test("prioritizes commit when commit is possible", () => {
		const state = getPrimaryAction({
			canCommit: true,
			hasStagedChanges: true,
			isPending: false,
			pushCount: 3,
			pullCount: 2,
			hasUpstream: true,
			pushActionCopy: getPushActionCopy({
				hasUpstream: true,
				pushCount: 3,
			}),
		});

		expect(state.action).toBe("commit");
		expect(state.labelKey).toBe("changes.primaryAction.commit");
		expect(state.tooltipKey).toBe("changes.primaryAction.commitStaged");
		expect(state.disabled).toBe(false);
	});

	test("shows sync when both push and pull are pending", () => {
		const state = getPrimaryAction({
			canCommit: false,
			hasStagedChanges: false,
			isPending: false,
			pushCount: 2,
			pullCount: 1,
			hasUpstream: true,
			pushActionCopy: getPushActionCopy({
				hasUpstream: true,
				pushCount: 2,
			}),
		});

		expect(state.action).toBe("sync");
		expect(state.labelKey).toBe("changes.primaryAction.sync");
		expect(state.tooltipKey).toBe("changes.primaryAction.syncTooltip");
		expect(state.tooltipValues).toEqual({ pull: 1, push: 2 });
	});

	test("shows push when only push is pending", () => {
		const state = getPrimaryAction({
			canCommit: false,
			hasStagedChanges: false,
			isPending: false,
			pushCount: 2,
			pullCount: 0,
			hasUpstream: true,
			pushActionCopy: getPushActionCopy({
				hasUpstream: true,
				pushCount: 2,
			}),
		});

		expect(state.action).toBe("push");
		expect(state.labelKey).toBe("changes.push.push");
		expect(state.tooltipKey).toBe("changes.push.pushCommits");
		expect(state.tooltipValues).toEqual({ count: 2 });
	});

	test("shows pull when only pull is pending", () => {
		const state = getPrimaryAction({
			canCommit: false,
			hasStagedChanges: false,
			isPending: false,
			pushCount: 0,
			pullCount: 2,
			hasUpstream: true,
			pushActionCopy: getPushActionCopy({
				hasUpstream: true,
				pushCount: 0,
			}),
		});

		expect(state.action).toBe("pull");
		expect(state.labelKey).toBe("changes.primaryAction.pull");
		expect(state.tooltipKey).toBe("changes.primaryAction.pullTooltip");
		expect(state.tooltipValues).toEqual({ count: 2 });
	});

	test("shows publish branch for unpublished branch without PR", () => {
		const state = getPrimaryAction({
			canCommit: false,
			hasStagedChanges: false,
			isPending: false,
			pushCount: 0,
			pullCount: 0,
			hasUpstream: false,
			pushActionCopy: getPushActionCopy({
				hasUpstream: false,
				pushCount: 0,
			}),
		});

		expect(state.action).toBe("push");
		expect(state.labelKey).toBe("changes.push.publishBranch");
		expect(state.tooltipKey).toBe("changes.push.publishBranchTooltip");
	});

	test("shows push label for unpublished branch with existing PR", () => {
		const state = getPrimaryAction({
			canCommit: false,
			hasStagedChanges: false,
			isPending: false,
			pushCount: 0,
			pullCount: 0,
			hasUpstream: false,
			pushActionCopy: getPushActionCopy({
				hasUpstream: false,
				pushCount: 0,
				pullRequest: {
					headRefName: "feature/pr-branch",
					headRepositoryOwner: "Kitenite",
				},
			}),
		});

		expect(state.action).toBe("push");
		expect(state.labelKey).toBe("changes.push.toPR");
		expect(state.tooltipKey).toBe("changes.push.pushChangesTooltip");
		expect(state.tooltipValues).toEqual({
			count: 0,
			target: "Kitenite:feature/pr-branch",
		});
	});

	test("falls back to disabled commit state", () => {
		const state = getPrimaryAction({
			canCommit: false,
			hasStagedChanges: false,
			isPending: false,
			pushCount: 0,
			pullCount: 0,
			hasUpstream: true,
			pushActionCopy: getPushActionCopy({
				hasUpstream: true,
				pushCount: 0,
			}),
		});

		expect(state.action).toBe("commit");
		expect(state.labelKey).toBe("changes.primaryAction.commit");
		expect(state.disabled).toBe(true);
		expect(state.tooltipKey).toBe("changes.primaryAction.noStagedChanges");
	});
});
