import { describe, expect, test } from "bun:test";
import { selectProjectWorkspaceId } from "./ProjectSettings";

describe("selectProjectWorkspaceId", () => {
	test("prefers the project's main workspace", () => {
		expect(
			selectProjectWorkspaceId(
				[
					{ id: "worktree", projectId: "project", type: "worktree" },
					{ id: "main", projectId: "project", type: "main" },
				],
				"project",
			),
		).toBe("main");
	});

	test("falls back to a usable worktree when no main workspace exists", () => {
		expect(
			selectProjectWorkspaceId(
				[{ id: "worktree", projectId: "project", type: "worktree" }],
				"project",
			),
		).toBe("worktree");
	});

	test("does not select a workspace from another project", () => {
		expect(
			selectProjectWorkspaceId(
				[{ id: "other", projectId: "other-project", type: "main" }],
				"project",
			),
		).toBeNull();
	});
});
