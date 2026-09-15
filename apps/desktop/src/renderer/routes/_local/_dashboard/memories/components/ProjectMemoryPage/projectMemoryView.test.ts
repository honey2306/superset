import { describe, expect, test } from "bun:test";
import {
	filterProjectMemories,
	getProjectsWithMemories,
} from "./projectMemoryView";
import type { ProjectMemoryRecord } from "./types";

function memory(
	id: string,
	patch: Partial<ProjectMemoryRecord> = {},
): ProjectMemoryRecord {
	return {
		id,
		projectId: "project-1",
		title: id,
		content: `content ${id}`,
		category: "other",
		source: "agent",
		sourceSessionId: null,
		pinned: false,
		enabled: true,
		createdAt: 1,
		updatedAt: 1,
		lastUsedAt: null,
		...patch,
	};
}

describe("filterProjectMemories", () => {
	test("shows enabled memory by default and orders pinned before recent", () => {
		const result = filterProjectMemories(
			[
				memory("recent", { updatedAt: 30 }),
				memory("pinned", { pinned: true, updatedAt: 10 }),
				memory("disabled", { enabled: false, updatedAt: 40 }),
			],
			"",
			"all",
		);
		expect(result.map((item) => item.id)).toEqual(["pinned", "recent"]);
	});

	test("searches content and exposes disabled memory only in its filter", () => {
		const rows = [
			memory("cdp", {
				content: "Match the renderer to the worktree",
				category: "debugging",
			}),
			memory("legacy", {
				title: "Legacy port",
				enabled: false,
			}),
		];
		expect(
			filterProjectMemories(rows, "renderer", "debugging").map(
				(item) => item.id,
			),
		).toEqual(["cdp"]);
		expect(
			filterProjectMemories(rows, "legacy", "disabled").map((item) => item.id),
		).toEqual(["legacy"]);
	});
});

describe("getProjectsWithMemories", () => {
	test("keeps sidebar order and excludes empty projects and off-sidebar memories", () => {
		const projects = [
			{ id: "second" },
			{ id: "empty" },
			{ id: "first" },
			{ id: "loading" },
		];
		const counts = new Map([
			["first", 1],
			["second", 2],
			["empty", 0],
			["removed", 3],
		]);
		expect(getProjectsWithMemories(projects, counts)).toEqual([
			{ id: "second" },
			{ id: "first" },
		]);
	});

	test("removes a project after its last saved memory is deleted", () => {
		expect(
			getProjectsWithMemories([{ id: "project" }], new Map([["project", 0]])),
		).toEqual([]);
	});
});
