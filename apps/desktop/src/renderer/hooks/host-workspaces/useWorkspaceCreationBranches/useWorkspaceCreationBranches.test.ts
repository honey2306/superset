import { describe, expect, test } from "bun:test";
import {
	normalizeWorkspaceCreationBranches,
	normalizeWorkspaceCreationWorktrees,
} from "./useWorkspaceCreationBranches";

const rows = [
	{
		name: "main",
		lastCommitDate: 1_700_000_000,
		isLocal: true,
		isRemote: true,
		recency: 1,
		worktreePath: "/repo",
		hasWorkspace: true,
		isCheckedOut: true,
	},
	{
		name: "feature/closed",
		lastCommitDate: 0,
		isLocal: true,
		isRemote: false,
		recency: null,
		worktreePath: "/repo/.worktrees/feature-closed",
		hasWorkspace: false,
		isCheckedOut: false,
	},
];

describe("workspace creation branch projection", () => {
	test("normalizes host Unix seconds to renderer milliseconds", () => {
		const branches = normalizeWorkspaceCreationBranches(rows);

		expect(branches[0]?.lastCommitDate).toBe(1_700_000_000_000);
		expect(branches[1]?.name).toBe("feature/closed");
	});

	test("projects only worktree-backed rows and preserves active state", () => {
		const worktrees = normalizeWorkspaceCreationWorktrees(rows);

		expect(worktrees).toEqual([
			{
				branch: "main",
				path: "/repo",
				hasActiveWorkspace: true,
				lastCommitDate: 1_700_000_000_000,
			},
			{
				branch: "feature/closed",
				path: "/repo/.worktrees/feature-closed",
				hasActiveWorkspace: false,
				lastCommitDate: 0,
			},
		]);
	});
});
