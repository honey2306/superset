import { describe, expect, test } from "bun:test";
import { isTemporaryWorkspaceActive } from "./isTemporaryWorkspaceActive";

describe("isTemporaryWorkspaceActive", () => {
	test("does not activate outside a workspace route while catalog data is unresolved", () => {
		expect(isTemporaryWorkspaceActive(undefined, [], [])).toBe(false);
	});

	test("activates for any workspace belonging to a temporary project", () => {
		expect(
			isTemporaryWorkspaceActive(
				"temporary-workspace",
				[{ id: "temporary-workspace", projectId: "temporary-project" }],
				[
					{
						id: "temporary-project",
						kind: "temporary",
						repoPath: "/tmp/Superset/temporary",
					},
				],
			),
		).toBe(true);
		expect(
			isTemporaryWorkspaceActive(
				"branch-workspace",
				[{ id: "branch-workspace", projectId: "temporary-project" }],
				[
					{
						id: "temporary-project",
						kind: "repository",
						repoPath: "/tmp/Superset/temporary",
					},
				],
			),
		).toBe(true);
		expect(
			isTemporaryWorkspaceActive(
				"repository-workspace",
				[{ id: "repository-workspace", projectId: "repository-project" }],
				[
					{
						id: "repository-project",
						kind: "repository",
						repoPath: "/tmp/repository",
					},
				],
			),
		).toBe(false);
	});
});
