import { describe, expect, test } from "bun:test";
import {
	getSidebarProjects,
	groupSidebarProjects,
	type SidebarProject,
	sortProjectsByTabOrder,
} from "./useWorkspaceShortcuts";

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

describe("getSidebarProjects", () => {
	test("excludes projects without a sidebar row and preserves persisted order", () => {
		const projects = [
			{ id: "project-a", name: "A" },
			{ id: "project-b", name: "B" },
			{ id: "project-c", name: "C" },
		];

		expect(
			getSidebarProjects(projects, [
				{ projectId: "project-a", tabOrder: 2 },
				{ projectId: "project-b", tabOrder: 1 },
			]),
		).toEqual([
			{ id: "project-b", name: "B" },
			{ id: "project-a", name: "A" },
		]);
	});
});

function makeSidebarProject(
	id: string,
	projectGroupId: string | null,
): SidebarProject {
	return {
		project: {
			id,
			name: id,
			color: "#000",
			githubOwner: null,
			mainRepoPath: `/tmp/${id}`,
			hideImage: false,
			iconUrl: null,
			projectGroupId,
		},
		workspaces: [],
		sections: [],
		topLevelItems: [],
	};
}

describe("groupSidebarProjects", () => {
	test("orders project groups and keeps ungrouped projects last", () => {
		const first = makeSidebarProject("first", "group-a");
		const second = makeSidebarProject("second", "group-b");
		const ungrouped = makeSidebarProject("ungrouped", null);

		const result = groupSidebarProjects(
			[first, second, ungrouped],
			[
				{ groupId: "group-b", name: "B", isCollapsed: false, tabOrder: 2 },
				{ groupId: "group-a", name: "A", isCollapsed: true, tabOrder: 1 },
			],
		);

		expect(result.projectGroups.map((group) => group.group.id)).toEqual([
			"group-a",
			"group-b",
		]);
		expect(result.groups.map((project) => project.project.id)).toEqual([
			"first",
			"second",
			"ungrouped",
		]);
		expect(result.projectGroups[0]?.group.isCollapsed).toBe(true);
	});

	test("treats a project with a missing group row as ungrouped", () => {
		const orphaned = makeSidebarProject("orphaned", "missing-group");
		const result = groupSidebarProjects([orphaned], []);

		expect(result.projectGroups).toEqual([]);
		expect(result.ungroupedProjects).toEqual([orphaned]);
	});
});
