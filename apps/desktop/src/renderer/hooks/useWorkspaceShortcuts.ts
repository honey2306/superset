import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { isSidebarProjectVisible } from "renderer/hooks/isSidebarProjectVisible";
import { useHotkey } from "renderer/hotkeys";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { isSidebarWorkspaceVisible } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useWorkspaceCatalog } from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider";
import type {
	SidebarSection,
	SidebarWorkspace,
} from "renderer/screens/main/components/WorkspaceSidebar/types";

type SidebarGroup = {
	project: {
		id: string;
		name: string;
		color: string;
		githubOwner: string | null;
		mainRepoPath: string;
		hideImage: boolean;
		iconUrl: string | null;
	};
	workspaces: SidebarWorkspace[];
	sections: SidebarSection[];
	topLevelItems: Array<{
		id: string;
		kind: "workspace" | "section";
		tabOrder: number;
	}>;
};

/**
 * Shared hook for workspace keyboard shortcuts.
 * Used by WorkspaceSidebar for navigation between workspaces.
 *
 * Handles ⌘1-9 workspace switching shortcuts (global).
 */
export function useWorkspaceShortcuts() {
	const { projects, workspaces } = useWorkspaceCatalog();
	const collections = useCollections();
	const { data: localWorkspaceRows = [] } = useLiveQuery(
		(q) => q.from({ rows: collections.v2WorkspaceLocalState }),
		[collections],
	);
	const { data: sectionRows = [] } = useLiveQuery(
		(q) => q.from({ rows: collections.v2SidebarSections }),
		[collections],
	);
	const navigate = useNavigate();

	const groups = useMemo<SidebarGroup[]>(() => {
		const localByWorkspaceId = new Map(
			localWorkspaceRows.map((row) => [row.workspaceId, row]),
		);
		return projects.filter(isSidebarProjectVisible).flatMap((project) => {
			const projectWorkspaces = workspaces
				.filter((workspace) => workspace.projectId === project.id)
				.filter((workspace) => {
					const local = localByWorkspaceId.get(workspace.id);
					return !local || isSidebarWorkspaceVisible(local);
				})
				.sort((a, b) => {
					const left = localByWorkspaceId.get(a.id)?.sidebarState.tabOrder;
					const right = localByWorkspaceId.get(b.id)?.sidebarState.tabOrder;
					return (
						(left ?? Number.MAX_SAFE_INTEGER) -
							(right ?? Number.MAX_SAFE_INTEGER) || a.updatedAt - b.updatedAt
					);
				})
				.map((workspace, index): SidebarWorkspace => {
					const local = localByWorkspaceId.get(workspace.id);
					return {
						id: workspace.id,
						projectId: workspace.projectId,
						worktreePath: workspace.worktreePath,
						type: workspace.type === "main" ? "branch" : "worktree",
						branch: workspace.branch,
						name: workspace.name,
						tabOrder: local?.sidebarState.tabOrder ?? index + 1,
						isUnread: local?.sidebarState.isUnread ?? false,
					};
				});
			const projectSections = sectionRows
				.filter((section) => section.projectId === project.id)
				.sort((a, b) => a.tabOrder - b.tabOrder)
				.map((section) => ({
					id: section.sectionId,
					projectId: section.projectId,
					name: section.name,
					tabOrder: section.tabOrder,
					isCollapsed: section.isCollapsed,
					color: section.color,
					workspaces: projectWorkspaces
						.filter(
							(workspace) =>
								localByWorkspaceId.get(workspace.id)?.sidebarState.sectionId ===
								section.sectionId,
						)
						.sort((a, b) => a.tabOrder - b.tabOrder),
				}));
			const topLevelItems = [
				...projectWorkspaces
					.filter(
						(workspace) =>
							!localByWorkspaceId.get(workspace.id)?.sidebarState.sectionId,
					)
					.map((workspace) => ({
						id: workspace.id,
						kind: "workspace" as const,
						tabOrder: workspace.tabOrder,
					})),
				...projectSections.map((section) => ({
					id: section.id,
					kind: "section" as const,
					tabOrder: section.tabOrder,
				})),
			].sort((a, b) => a.tabOrder - b.tabOrder);
			return [
				{
					project: {
						id: project.id,
						name: project.name,
						color: "hsl(var(--primary))",
						githubOwner: project.repoOwner,
						mainRepoPath: project.repoPath,
						hideImage: false,
						iconUrl: null,
					},
					workspaces: projectWorkspaces,
					sections: projectSections,
					topLevelItems,
				},
			];
		});
	}, [localWorkspaceRows, projects, sectionRows, workspaces]);

	const allWorkspaces = groups.flatMap((group) => {
		const topLevelWorkspacesById = new Map(
			group.workspaces.map((workspace) => [workspace.id, workspace]),
		);
		const sectionsById = new Map(
			(group.sections ?? []).map((section) => [section.id, section]),
		);

		return group.topLevelItems.flatMap((item) => {
			if (item.kind === "workspace") {
				const workspace = topLevelWorkspacesById.get(item.id);
				return workspace ? [workspace] : [];
			}

			return sectionsById.get(item.id)?.workspaces ?? [];
		});
	});

	const switchToWorkspace = useCallback(
		(index: number) => {
			const workspace = allWorkspaces[index];
			if (workspace) {
				navigateToWorkspace(workspace.id, navigate);
			}
		},
		[allWorkspaces, navigate],
	);

	useHotkey("JUMP_TO_WORKSPACE_1", () => switchToWorkspace(0));
	useHotkey("JUMP_TO_WORKSPACE_2", () => switchToWorkspace(1));
	useHotkey("JUMP_TO_WORKSPACE_3", () => switchToWorkspace(2));
	useHotkey("JUMP_TO_WORKSPACE_4", () => switchToWorkspace(3));
	useHotkey("JUMP_TO_WORKSPACE_5", () => switchToWorkspace(4));
	useHotkey("JUMP_TO_WORKSPACE_6", () => switchToWorkspace(5));
	useHotkey("JUMP_TO_WORKSPACE_7", () => switchToWorkspace(6));
	useHotkey("JUMP_TO_WORKSPACE_8", () => switchToWorkspace(7));
	useHotkey("JUMP_TO_WORKSPACE_9", () => switchToWorkspace(8));

	return {
		groups,
		allWorkspaces,
	};
}
