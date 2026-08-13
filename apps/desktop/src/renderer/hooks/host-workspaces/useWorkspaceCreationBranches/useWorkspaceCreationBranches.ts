import type { AppRouter } from "@superset/host-service";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";

type SearchBranchesOutput =
	inferRouterOutputs<AppRouter>["workspaceCreation"]["searchBranches"];

export type WorkspaceCreationBranch = SearchBranchesOutput["items"][number] & {
	/** Renderer relative-time helpers consume JavaScript milliseconds. */
	lastCommitDate: number;
};

export type WorkspaceCreationWorktree = {
	branch: string;
	path: string;
	hasActiveWorkspace: boolean;
	/** Last commit timestamp in JavaScript milliseconds. */
	lastCommitDate: number;
};

export function normalizeWorkspaceCreationBranches(
	items: SearchBranchesOutput["items"],
): WorkspaceCreationBranch[] {
	return items.map((branch) => ({
		...branch,
		lastCommitDate: branch.lastCommitDate * 1000,
	}));
}

export function normalizeWorkspaceCreationWorktrees(
	items: SearchBranchesOutput["items"],
): WorkspaceCreationWorktree[] {
	return items.flatMap((branch) =>
		branch.worktreePath
			? [
					{
						branch: branch.name,
						path: branch.worktreePath,
						hasActiveWorkspace: branch.hasWorkspace,
						lastCommitDate: branch.lastCommitDate * 1000,
					},
				]
			: [],
	);
}

export function getWorkspaceCreationBranchesQueryKey({
	projectId,
	hostUrl,
	filter,
	query,
}: {
	projectId: string | null;
	hostUrl: string | null;
	filter: "all" | "worktree";
	query: string;
}) {
	return [
		"host-service",
		"workspaceCreation",
		"searchBranches",
		projectId,
		hostUrl,
		filter,
		query,
	] as const;
}

/**
 * Reads branch picker data from the owning local host. The host returns Unix
 * seconds; this hook normalizes timestamps to renderer milliseconds so old
 * picker components can keep using the shared relative-time formatter.
 */
export function useWorkspaceCreationBranches(
	projectId: string | null,
	query = "",
) {
	const { activeHostUrl } = useLocalHostService();
	const result = useQuery({
		queryKey: getWorkspaceCreationBranchesQueryKey({
			projectId,
			hostUrl: activeHostUrl,
			filter: "all",
			query,
		}),
		enabled: Boolean(projectId && activeHostUrl),
		networkMode: "always" as const,
		staleTime: 30_000,
		queryFn: async (): Promise<SearchBranchesOutput> => {
			if (!projectId || !activeHostUrl) {
				return { defaultBranch: null, items: [], nextCursor: null };
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).workspaceCreation.searchBranches.query({
				projectId,
				query: query || undefined,
				limit: 200,
				refresh: !query,
			});
		},
	});

	const branches = useMemo<WorkspaceCreationBranch[]>(
		() => normalizeWorkspaceCreationBranches(result.data?.items ?? []),
		[result.data],
	);

	return {
		...result,
		branches,
		defaultBranch: result.data?.defaultBranch ?? null,
		hostUrl: activeHostUrl,
	};
}

/**
 * Returns all live git worktrees for a project, excluding the main repository
 * (the host's worktree-filtered branch result marks that row as an active
 * workspace). Closed rows are still returned so the caller can offer adopt.
 */
export function useWorkspaceCreationWorktrees(projectId: string | null) {
	const { activeHostUrl } = useLocalHostService();
	const result = useQuery({
		queryKey: getWorkspaceCreationBranchesQueryKey({
			projectId,
			hostUrl: activeHostUrl,
			filter: "worktree",
			query: "",
		}),
		enabled: Boolean(projectId && activeHostUrl),
		networkMode: "always" as const,
		staleTime: 30_000,
		queryFn: async (): Promise<SearchBranchesOutput> => {
			if (!projectId || !activeHostUrl) {
				return { defaultBranch: null, items: [], nextCursor: null };
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).workspaceCreation.searchBranches.query({
				projectId,
				filter: "worktree",
				limit: 200,
				refresh: true,
			});
		},
	});

	const worktrees = useMemo<WorkspaceCreationWorktree[]>(
		() => normalizeWorkspaceCreationWorktrees(result.data?.items ?? []),
		[result.data],
	);

	return {
		...result,
		worktrees,
		hostUrl: activeHostUrl,
	};
}
