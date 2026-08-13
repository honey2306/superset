import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useQueries } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LuSearch, LuX } from "react-icons/lu";
import {
	getWorkspaceCreationBranchesQueryKey,
	normalizeWorkspaceCreationWorktrees,
} from "renderer/hooks/host-workspaces/useWorkspaceCreationBranches";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useOpenTrackedWorktree } from "renderer/react-query/workspaces/useOpenTrackedWorktree";
import { navigateToWorkspace } from "renderer/routes/_local/_dashboard/utils/workspace-navigation";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import type { FilterMode, ProjectGroup, WorkspaceItem } from "./types";
import { WorkspaceRow } from "./WorkspaceRow";

const FILTER_OPTIONS: { value: FilterMode; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "active", label: "Active" },
	{ value: "closed", label: "Closed" },
];

export function WorkspacesListView() {
	const [searchQuery, setSearchQuery] = useState("");
	const [filterMode, setFilterMode] = useState<FilterMode>("all");
	const [openingWorktreePath, setOpeningWorktreePath] = useState<string | null>(
		null,
	);
	const navigate = useNavigate();

	const { projects: catalogProjects, workspaces: catalogWorkspaces } =
		useWorkspaceCatalog();
	const { activeHostUrl } = useLocalHostService();
	const allProjects = catalogProjects;
	const groups = useMemo<ProjectGroup[]>(() => {
		const projectNames = new Map(
			catalogProjects.map((project) => [project.id, project.name]),
		);
		const grouped = new Map<string, ProjectGroup>();
		for (const workspace of catalogWorkspaces) {
			const group = grouped.get(workspace.projectId) ?? {
				projectId: workspace.projectId,
				projectName:
					projectNames.get(workspace.projectId) ?? workspace.projectId,
				workspaces: [],
			};
			group.workspaces.push({
				uniqueId: workspace.id,
				workspaceId: workspace.id,
				projectId: workspace.projectId,
				projectName:
					projectNames.get(workspace.projectId) ?? workspace.projectId,
				worktreePath: workspace.worktreePath,
				type: workspace.type === "main" ? "branch" : "worktree",
				branch: workspace.branch,
				name: workspace.name,
				lastOpenedAt: workspace.updatedAt,
				createdAt: workspace.createdAt,
				isUnread: false,
				isOpen: true,
			});
			grouped.set(workspace.projectId, group);
		}
		return Array.from(grouped.values());
	}, [catalogProjects, catalogWorkspaces]);

	// Discover orphan worktrees (present on disk, no Catalog workspace)
	// through the owning host. This is the same source that powers the
	// project ExternalWorktreesBanner and the New Workspace picker; keeping
	// them consistent means "Closed" here always matches the picker.
	const worktreeQueries = useQueries({
		queries: allProjects.map((project) => ({
			queryKey: getWorkspaceCreationBranchesQueryKey({
				projectId: project.id,
				hostUrl: activeHostUrl,
				filter: "worktree" as const,
				query: "",
			}),
			enabled: Boolean(activeHostUrl),
			networkMode: "always" as const,
			staleTime: 30_000,
			queryFn: async () => {
				if (!activeHostUrl) return [];
				const result = await getHostServiceClientByUrl(
					activeHostUrl,
				).workspaceCreation.searchBranches.query({
					projectId: project.id,
					filter: "worktree",
					limit: 200,
					refresh: true,
				});
				return normalizeWorkspaceCreationWorktrees(result.items);
			},
		})),
	});

	const openWorktree = useOpenTrackedWorktree();

	// Combine open workspaces and closed worktrees into a single list
	const allItems = useMemo<WorkspaceItem[]>(() => {
		const items: WorkspaceItem[] = [];

		// First, add all open workspaces from groups
		for (const group of groups) {
			for (const ws of group.workspaces) {
				items.push({
					uniqueId: ws.uniqueId,
					workspaceId: ws.workspaceId,
					projectId: ws.projectId,
					projectName: group.projectName,
					worktreePath: ws.worktreePath,
					type: ws.type,
					branch: ws.branch,
					name: ws.name,
					lastOpenedAt: ws.lastOpenedAt,
					createdAt: ws.createdAt,
					isUnread: ws.isUnread,
					isOpen: true,
				});
			}
		}

		// Add orphan worktrees (present on disk, no active workspace)
		for (let i = 0; i < allProjects.length; i++) {
			const project = allProjects[i];
			const orphans = worktreeQueries[i]?.data;
			if (!project || !orphans) continue;

			for (const wt of orphans) {
				if (wt.hasActiveWorkspace) continue;

				items.push({
					uniqueId: `wt-${project.id}-${wt.path}`,
					workspaceId: null,
					projectId: project.id,
					projectName: project.name,
					worktreePath: wt.path,
					type: "worktree",
					branch: wt.branch,
					name: wt.branch,
					lastOpenedAt: wt.lastCommitDate || 0,
					createdAt: wt.lastCommitDate || 0,
					isUnread: false,
					isOpen: false,
				});
			}
		}

		return items;
	}, [groups, allProjects, worktreeQueries]);

	// Filter by search query and filter mode
	const filteredItems = useMemo(() => {
		let items = allItems;

		// Apply filter mode
		if (filterMode === "active") {
			items = items.filter((ws) => ws.isOpen);
		} else if (filterMode === "closed") {
			items = items.filter((ws) => !ws.isOpen);
		}

		// Apply search filter
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			items = items.filter(
				(ws) =>
					ws.name.toLowerCase().includes(query) ||
					ws.projectName.toLowerCase().includes(query) ||
					ws.branch.toLowerCase().includes(query),
			);
		}

		return items;
	}, [allItems, searchQuery, filterMode]);

	// Group by project
	const projectGroups = useMemo<ProjectGroup[]>(() => {
		const groupsMap = new Map<string, ProjectGroup>();

		for (const item of filteredItems) {
			if (!groupsMap.has(item.projectId)) {
				groupsMap.set(item.projectId, {
					projectId: item.projectId,
					projectName: item.projectName,
					workspaces: [],
				});
			}
			groupsMap.get(item.projectId)?.workspaces.push(item);
		}

		// Sort workspaces within each group: active first, then by lastOpenedAt
		for (const group of groupsMap.values()) {
			group.workspaces.sort((a, b) => {
				// Active workspaces first
				if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
				// Then by most recently opened/created
				return b.lastOpenedAt - a.lastOpenedAt;
			});
		}

		// Sort groups by most recent activity
		return Array.from(groupsMap.values()).sort((a, b) => {
			const aRecent = Math.max(...a.workspaces.map((w) => w.lastOpenedAt));
			const bRecent = Math.max(...b.workspaces.map((w) => w.lastOpenedAt));
			return bRecent - aRecent;
		});
	}, [filteredItems]);

	const handleSwitch = (item: WorkspaceItem) => {
		if (item.workspaceId) {
			navigateToWorkspace(item.workspaceId, navigate);
		}
	};

	const handleReopen = (item: WorkspaceItem) => {
		if (!item.workspaceId && item.worktreePath) {
			setOpeningWorktreePath(item.worktreePath);
			void openWorktree
				.mutateAsync({
					projectId: item.projectId,
					worktreePath: item.worktreePath,
				})
				.catch((error: unknown) => {
					toast.error(
						`Failed to open workspace: ${
							error instanceof Error ? error.message : String(error)
						}`,
					);
				})
				.finally(() => setOpeningWorktreePath(null));
		}
	};

	// Count stats for filter badges
	const activeCount = allItems.filter((w) => w.isOpen).length;
	const closedCount = allItems.filter((w) => !w.isOpen).length;

	return (
		<div className="flex-1 flex flex-col bg-surface overflow-hidden">
			{/* Header */}
			<div className="flex items-center gap-3 px-4 py-2 border-b border-line/50">
				{/* Filter toggle */}
				<div className="flex items-center gap-1 bg-hover/50 rounded-ds-3 p-0.5">
					{FILTER_OPTIONS.map((option) => {
						const count =
							option.value === "all"
								? allItems.length
								: option.value === "active"
									? activeCount
									: closedCount;
						return (
							<button
								key={option.value}
								type="button"
								onClick={() => setFilterMode(option.value)}
								className={cn(
									"px-2 py-1 text-xs rounded-ds-3 transition-colors",
									filterMode === option.value
										? "bg-accent-tint text-fg"
										: "text-fg-mute hover:text-fg",
								)}
							>
								{option.label}
								<span className="ml-1 text-fg-mute/40">{count}</span>
							</button>
						);
					})}
				</div>

				{/* Search */}
				<div className="relative flex-1">
					<LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-mute/50" />
					<Input
						type="text"
						placeholder="Search..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-9 h-8 bg-hover/50"
					/>
				</div>

				{/* Close button */}
				<Button
					variant="ghost"
					size="icon"
					onClick={() => navigate({ to: "/workspace" })}
					className="size-7 text-fg-mute hover:text-fg shrink-0"
				>
					<LuX className="size-4" />
				</Button>
			</div>

			{/* Workspaces list grouped by project */}
			<div className="flex-1 overflow-y-auto">
				{projectGroups.map((group) => (
					<div key={group.projectId}>
						{/* Project header */}
						<div className="sticky top-0 bg-surface/95 backdrop-blur-sm px-4 py-2 border-b border-line/50">
							<span className="text-xs font-medium text-fg-mute">
								{group.projectName}
							</span>
							<span className="text-xs text-fg-mute/40 ml-2">
								{group.workspaces.length}
							</span>
						</div>

						{/* Workspaces in this project */}
						{group.workspaces.map((ws) => (
							<WorkspaceRow
								key={ws.uniqueId}
								workspace={ws}
								onSwitch={() => handleSwitch(ws)}
								onReopen={() => handleReopen(ws)}
								isOpening={
									openWorktree.isPending &&
									openingWorktreePath === ws.worktreePath
								}
							/>
						))}
					</div>
				))}

				{filteredItems.length === 0 && (
					<div className="flex items-center justify-center h-32 text-fg-mute/50 text-sm">
						{searchQuery
							? "No workspaces match your search"
							: filterMode === "active"
								? "No active workspaces"
								: filterMode === "closed"
									? "No closed workspaces"
									: "No workspaces yet"}
					</div>
				)}
			</div>
		</div>
	);
}
