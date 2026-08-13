import { describe, expect, test } from "bun:test";
import { supportsWorkspaceChanges } from "./supportsWorkspaceChanges";

describe("supportsWorkspaceChanges", () => {
	test("enables changes for repository workspaces", () => {
		expect(
			supportsWorkspaceChanges({
				worktreePath: "/repos/superset",
				project: { kind: "repository", repoPath: "/repos/superset" },
			}),
		).toBe(true);
	});

	test("disables changes for temporary projects", () => {
		expect(
			supportsWorkspaceChanges({
				worktreePath: "/Users/test/Superset/temporary",
				project: {
					kind: "temporary",
					repoPath: "/Users/test/Superset/temporary",
				},
			}),
		).toBe(false);
	});

	test("disables changes for legacy temporary projects marked as repositories", () => {
		expect(
			supportsWorkspaceChanges({
				worktreePath: "C:\\Users\\test\\Superset\\temporary",
				project: {
					kind: "repository",
					repoPath: "C:\\Users\\test\\Superset\\temporary",
				},
			}),
		).toBe(false);
	});

	test("fails closed while the project is unavailable", () => {
		expect(
			supportsWorkspaceChanges({
				worktreePath: "/repos/superset",
				project: null,
			}),
		).toBe(false);
	});
});
