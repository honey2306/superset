import type {
	TreeLeaf,
	TreeProject,
} from "../buildProjectTree/buildProjectTree";

export type ConversationListItem = TreeLeaf & {
	projectId: string;
	projectTitle: string;
	workspaceId: string;
	workspaceTitle: string;
};

/**
 * Flattens the catalog hierarchy for the phone UI without changing ownership.
 * Every row keeps its project and workspace identifiers for routing and labels.
 */
export function buildConversationList(
	projects: readonly TreeProject[],
): ConversationListItem[] {
	return projects
		.flatMap((project) =>
			project.workspaces.flatMap((workspace) =>
				workspace.leaves.map((leaf) => ({
					...leaf,
					projectId: project.id,
					projectTitle: project.title,
					workspaceId: workspace.id,
					workspaceTitle: workspace.title,
				})),
			),
		)
		.sort(
			(left, right) =>
				right.updatedAt - left.updatedAt ||
				left.projectId.localeCompare(right.projectId) ||
				left.id.localeCompare(right.id),
		);
}
