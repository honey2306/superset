import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { isSidebarProjectVisible } from "renderer/hooks/isSidebarProjectVisible";
import { useHotkey } from "renderer/hotkeys";
import { navigateToWorkspace } from "renderer/routes/_local/_dashboard/utils/workspace-navigation";
import { useLocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import type {
	SidebarSection,
	SidebarWorkspace,
} from "renderer/screens/main/components/WorkspaceSidebar/types";

export type SidebarProject = {
	project: {
		id: string;
		name: string;
		color: string;
		githubOwner: string | null;
		mainRepoPath: string;
		hideImage: boolean;
		iconUrl: string | null;
		projectGroupId: string | null;
	};
	workspaces: SidebarWorkspace[];
	sections: SidebarSection[];
	topLevelItems: Array<{
		id: string;
		kind: "workspace" | "section";
		tabOrder: number;
	}>;
};

export function sortProjectsByTabOrder<T extends { id: string }>(
	projects: readonly T[],
	localProjectRows: readonly { projectId: string; tabOrder: number }[],
): T[] {
	const localByProjectId = new Map(
		localProjectRows.map((row) => [row.projectId, row]),
	);
	return [...projects].sort((left, right) => {
		const leftOrder = localByProjectId.get(left.id)?.tabOrder;
		const rightOrder = localByProjectId.get(right.id)?.tabOrder;
		return (
			(leftOrder ?? Number.MAX_SAFE_INTEGER) -
			(rightOrder ?? Number.MAX_SAFE_INTEGER)
		);
	});
}

export function getSidebarProjects<T extends { id: string }>(
	projects: readonly T[],
	localProjectRows: readonly { projectId: string; tabOrder: number }[],
): T[] {
	const sidebarProjectIds = new Set(
		localProjectRows.map((row) => row.projectId),
	);
	return sortProjectsByTabOrder(
		projects.filter((project) => sidebarProjectIds.has(project.id)),
		localProjectRows,
	);
}

export function groupSidebarProjects(
	sidebarProjects: SidebarProject[],
	projectGroupRows: ReadonlyArray<{
		groupId: string;
		name: string;
		isCollapsed: boolean;
		tabOrder: number;
	}>,
) {
	const orderedProjectGroups = [...projectGroupRows].sort(
		(left, right) => left.tabOrder - right.tabOrder,
	);
	const validProjectGroupIds = new Set(
		orderedProjectGroups.map((group) => group.groupId),
	);
	const projectGroups = orderedProjectGroups.map((group) => ({
		group: {
			id: group.groupId,
			name: group.name,
			isCollapsed: group.isCollapsed,
			tabOrder: group.tabOrder,
		},
		projects: sidebarProjects.filter(
			(project) => project.project.projectGroupId === group.groupId,
		),
	}));
	const ungroupedProjects = sidebarProjects.filter(
		(project) =>
			project.project.projectGroupId === null ||
			!validProjectGroupIds.has(project.project.projectGroupId),
	);
	return {
		projectGroups,
		ungroupedProjects,
		groups: [
			...projectGroups.flatMap((group) => group.projects),
			...ungroupedProjects,
		],
	};
}

/**
 * Shared hook for workspace keyboard shortcuts.
 * Used by WorkspaceSidebar for navigation between workspaces.
 *
 * Handles ⌘1-9 workspace switching shortcuts (global).
 */
export function useWorkspaceShortcuts() {
	const { projects, workspaces } = useWorkspaceCatalog();
	const collections = useLocalCollections();
	const { data: localWorkspaceRows = [] } = useLiveQuery(
		(q) => q.from({ rows: collections.workspaceLocalState }),
		[collections],
	);
	const { data: localProjectRows = [] } = useLiveQuery(
		(q) => q.from({ rows: collections.sidebarProjects }),
		[collections],
	);
	const { data: sectionRows = [] } = useLiveQuery(
		(q) => q.from({ rows: collections.sidebarSections }),
		[collections],
	);
	const { data: projectGroupRows = [] } = useLiveQuery(
		(q) => q.from({ rows: collections.sidebarProjectGroups }),
		[collections],
	);
	const navigate = useNavigate();

	const sidebarProjects = useMemo<SidebarProject[]>(() => {
		const localByWorkspaceId = new Map(
			localWorkspaceRows.map((row) => [row.workspaceId, row]),
		);
		const localByProjectId = new Map(
			localProjectRows.map((row) => [row.projectId, row]),
		);
		const visibleProjects = getSidebarProjects(
			projects.filter(isSidebarProjectVisible),
			localProjectRows,
		);
		return visibleProjects.flatMap((project) => {
			const projectWorkspaces = workspaces
				.filter((workspace) => workspace.projectId === project.id)
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
			const localProject = localByProjectId.get(project.id);
			return [
				{
					project: {
						id: project.id,
						name: project.name,
						color: localProject?.color ?? "var(--primary)",
						githubOwner: project.repoOwner,
						mainRepoPath: project.repoPath,
						hideImage: localProject?.hideImage ?? false,
						iconUrl: null,
						projectGroupId: localProject?.groupId ?? null,
					},
					workspaces: projectWorkspaces,
					sections: projectSections,
					topLevelItems,
				},
			];
		});
	}, [localProjectRows, localWorkspaceRows, projects, sectionRows, workspaces]);

	const { projectGroups, ungroupedProjects, groups } = useMemo(
		() => groupSidebarProjects(sidebarProjects, projectGroupRows),
		[projectGroupRows, sidebarProjects],
	);

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
		projectGroups,
		ungroupedProjects,
		allWorkspaces,
	};
}
