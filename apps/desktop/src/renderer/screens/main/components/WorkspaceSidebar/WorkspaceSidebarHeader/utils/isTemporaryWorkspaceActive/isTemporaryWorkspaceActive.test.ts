import { describe, expect, test } from "bun:test";
import { isTemporaryWorkspaceActive } from "./isTemporaryWorkspaceActive";

describe("isTemporaryWorkspaceActive", () => {
	test("does not activate outside a workspace route", () => {
		expect(isTemporaryWorkspaceActive(undefined, [], [])).toBe(false);
	});

	test("activates any workspace that belongs to a temporary project", () => {
		expect(
			isTemporaryWorkspaceActive(
				"temporary-worktree",
				[{ id: "temporary-worktree", projectId: "temporary-project" }],
				[{ id: "temporary-project", kind: "temporary" }],
			),
		).toBe(true);
	});

	test("does not activate a repository workspace", () => {
		expect(
			isTemporaryWorkspaceActive(
				"repository-workspace",
				[{ id: "repository-workspace", projectId: "repository-project" }],
				[{ id: "repository-project", kind: "repository" }],
			),
		).toBe(false);
	});
});
