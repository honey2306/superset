import { describe, expect, it } from "bun:test";
import { selectWorkspacesToPlace } from "./selectWorkspacesToPlace";

describe("selectWorkspacesToPlace", () => {
	it("places every catalog workspace, including main workspaces", () => {
		const result = selectWorkspacesToPlace([
			{ id: "main-1", projectId: "p1", type: "main" },
			{ id: "wt-1", projectId: "p1", type: "worktree" },
		]);

		expect(result).toEqual([
			{ id: "main-1", projectId: "p1" },
			{ id: "wt-1", projectId: "p1" },
		]);
	});

	it("places main workspaces even when they are not active", () => {
		const result = selectWorkspacesToPlace([
			{ id: "main-active", projectId: "p1", type: "main" },
			{ id: "main-ambient", projectId: "p2", type: "main" },
			{ id: "wt-1", projectId: "p1", type: "worktree" },
		]);

		expect(result).toEqual([
			{ id: "main-active", projectId: "p1" },
			{ id: "main-ambient", projectId: "p2" },
			{ id: "wt-1", projectId: "p1" },
		]);
	});

	it("returns catalog workspaces even when local state already has a row", () => {
		const result = selectWorkspacesToPlace([
			{ id: "wt-seen", projectId: "p1", type: "worktree" },
			{ id: "wt-new", projectId: "p1", type: "worktree" },
		]);

		expect(result).toEqual([
			{ id: "wt-seen", projectId: "p1" },
			{ id: "wt-new", projectId: "p1" },
		]);
	});

	it("does not resurrect hidden workspace tombstones", () => {
		const result = selectWorkspacesToPlace(
			[
				{ id: "hidden", projectId: "p1", type: "worktree" },
				{ id: "visible", projectId: "p1", type: "main" },
			],
			new Set(["hidden"]),
		);

		expect(result).toEqual([{ id: "visible", projectId: "p1" }]);
	});
});
