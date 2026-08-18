import { describe, expect, test } from "bun:test";
import { sortProjectsByTabOrder } from "./useWorkspaceShortcuts";

describe("sortProjectsByTabOrder", () => {
	test("renders projects in the order persisted by a project drag", () => {
		const projects = [
			{ id: "project-a", name: "A" },
			{ id: "project-b", name: "B" },
			{ id: "project-c", name: "C" },
		];

		expect(
			sortProjectsByTabOrder(projects, [
				{ projectId: "project-a", tabOrder: 2 },
				{ projectId: "project-b", tabOrder: 1 },
			]),
		).toEqual([
			{ id: "project-b", name: "B" },
			{ id: "project-a", name: "A" },
			{ id: "project-c", name: "C" },
		]);
	});
});
