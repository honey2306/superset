import { expect, test } from "bun:test";
import type { TreeProject } from "../buildProjectTree/buildProjectTree";
import { buildConversationList } from "./buildConversationList";

const projects: TreeProject[] = [
	{
		id: "project-1",
		title: "Superset",
		workspaces: [
			{
				id: "workspace-main",
				title: "main",
				branch: "main",
				leaves: [
					{
						kind: "acp",
						id: "older-session",
						title: "Older conversation",
						updatedAt: 10,
						running: false,
					},
				],
			},
		],
	},
	{
		id: "project-2",
		title: "Proma",
		workspaces: [
			{
				id: "workspace-feature",
				title: "feature/mobile",
				branch: "feature/mobile",
				leaves: [
					{
						kind: "acp",
						id: "newer-session",
						title: "Newer conversation",
						updatedAt: 20,
						running: true,
					},
				],
			},
		],
	},
];

test("flattens conversations across projects in recent activity order", () => {
	expect(buildConversationList(projects)).toEqual([
		{
			kind: "acp",
			id: "newer-session",
			title: "Newer conversation",
			updatedAt: 20,
			running: true,
			projectId: "project-2",
			projectTitle: "Proma",
			workspaceId: "workspace-feature",
			workspaceTitle: "feature/mobile",
		},
		{
			kind: "acp",
			id: "older-session",
			title: "Older conversation",
			updatedAt: 10,
			running: false,
			projectId: "project-1",
			projectTitle: "Superset",
			workspaceId: "workspace-main",
			workspaceTitle: "main",
		},
	]);
});

test("does not mutate the project hierarchy", () => {
	const original = structuredClone(projects);
	buildConversationList(projects);
	expect(projects).toEqual(original);
});
