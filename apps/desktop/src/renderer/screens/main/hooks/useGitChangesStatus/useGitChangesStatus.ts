import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type {
	ChangedFile,
	FileStatus,
	GitChangesStatus,
} from "shared/changes-types";

interface UseGitChangesStatusOptions {
	workspaceId?: string;
	worktreePath: string | undefined;
	enabled?: boolean;
	refetchInterval?: number;
	refetchOnWindowFocus?: boolean;
	staleTime?: number;
	branchRefetchInterval?: number;
	branchRefetchOnWindowFocus?: boolean;
}

function normalizeFileStatus(status: string): FileStatus {
	return status === "changed" ? "modified" : (status as FileStatus);
}

function normalizeFiles(
	files: Array<{
		path: string;
		oldPath?: string;
		status: string;
		additions: number;
		deletions: number;
		isBinary?: boolean;
	}>,
): ChangedFile[] {
	return files.map((file) => ({
		...file,
		status: normalizeFileStatus(file.status),
	}));
}

/**
 * Compatibility adapter for the v1 changes surfaces.
 *
 * Workspace catalog rows are owned by host-service and are no longer mirrored
 * into Electron's legacy local.db. Reading status through the old
 * `electronTrpc.changes` router therefore rejects newly-created workspaces as
 * unregistered. Keep the existing UI model for now, but source it from the
 * workspace-scoped host-service git router.
 */
export function useGitChangesStatus({
	workspaceId = "",
	enabled = true,
	refetchInterval,
	refetchOnWindowFocus,
	staleTime,
}: UseGitChangesStatusOptions) {
	const hostUrl = useWorkspaceHostUrl(workspaceId || null);
	const queryEnabled = enabled && Boolean(workspaceId) && Boolean(hostUrl);
	const statusQuery = useQuery({
		queryKey: ["git-changes-status", hostUrl, workspaceId],
		enabled: queryEnabled,
		queryFn: () => {
			if (!hostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(hostUrl).git.getStatus.query({
				workspaceId,
				priority: "foreground",
			});
		},
		refetchInterval,
		refetchOnWindowFocus,
		staleTime,
	});
	const syncQuery = useQuery({
		queryKey: ["git-branch-sync-status", hostUrl, workspaceId],
		enabled: queryEnabled,
		queryFn: () => {
			if (!hostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(hostUrl).git.getBranchSyncStatus.query({
				workspaceId,
			});
		},
		refetchInterval,
		refetchOnWindowFocus,
		staleTime,
	});
	const commitsQuery = useQuery({
		queryKey: [
			"git-changes-commits",
			hostUrl,
			workspaceId,
			statusQuery.data?.defaultBranch.name,
		],
		enabled: queryEnabled && Boolean(statusQuery.data),
		queryFn: () => {
			if (!hostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(hostUrl).git.listCommits.query({
				workspaceId,
				baseBranch: statusQuery.data?.defaultBranch.name || undefined,
			});
		},
		refetchInterval,
		refetchOnWindowFocus,
		staleTime,
	});

	const status = useMemo<GitChangesStatus | undefined>(() => {
		const hostStatus = statusQuery.data;
		if (!hostStatus) return undefined;

		const unstaged = normalizeFiles(hostStatus.unstaged);
		const commits = (commitsQuery.data?.commits ?? []).map((commit) => ({
			hash: commit.hash,
			shortHash: commit.shortHash,
			message: commit.message,
			author: commit.author,
			date: new Date(commit.date),
			files: [],
		}));

		return {
			branch: hostStatus.currentBranch.name,
			defaultBranch: hostStatus.defaultBranch.name,
			againstBase: normalizeFiles(hostStatus.againstBase),
			commits,
			totalCommitCount: hostStatus.currentBranch.aheadCount,
			staged: normalizeFiles(hostStatus.staged),
			unstaged: unstaged.filter((file) => file.status !== "untracked"),
			untracked: unstaged.filter((file) => file.status === "untracked"),
			ahead: hostStatus.currentBranch.aheadCount,
			behind: hostStatus.currentBranch.behindCount,
			pushCount: syncQuery.data?.pushCount ?? 0,
			pullCount: syncQuery.data?.pullCount ?? 0,
			hasUpstream: syncQuery.data?.hasUpstream ?? false,
		};
	}, [commitsQuery.data, statusQuery.data, syncQuery.data]);

	const effectiveBaseBranch = status?.defaultBranch || "main";
	const branchData = status
		? {
				currentBranch: status.branch,
				defaultBranch: status.defaultBranch,
				worktreeBaseBranch: null,
				local: [],
				remote: [],
				checkedOutBranches: {},
			}
		: undefined;

	return {
		status,
		isLoading: !status && (statusQuery.isLoading || !hostUrl),
		effectiveBaseBranch,
		branchData,
		refetch: statusQuery.refetch,
	};
}
