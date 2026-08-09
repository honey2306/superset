import { describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";

const hostStatus = {
	currentBranch: {
		name: "feature",
		isHead: true,
		upstream: "origin/feature",
		aheadCount: 2,
		behindCount: 1,
		lastCommitHash: "abc123",
		lastCommitDate: "2026-08-08T00:00:00.000Z",
	},
	defaultBranch: {
		name: "main",
		isHead: false,
		upstream: "origin/main",
		aheadCount: 0,
		behindCount: 0,
		lastCommitHash: "def456",
		lastCommitDate: "2026-08-07T00:00:00.000Z",
	},
	againstBase: [],
	staged: [],
	unstaged: [
		{
			path: "tracked.ts",
			status: "modified" as const,
			additions: 1,
			deletions: 0,
		},
		{
			path: "new.ts",
			status: "untracked" as const,
			additions: 2,
			deletions: 0,
		},
	],
	ignoredPaths: [],
};

const getStatus = mock(async () => hostStatus);
const getBranchSyncStatus = mock(async () => ({
	hasRepo: true,
	hasUpstream: true,
	pushCount: 3,
	pullCount: 1,
	isDefaultBranch: false,
	isDetached: false,
	hasUncommitted: true,
	currentBranch: "feature",
	defaultBranch: "main",
}));
const listCommits = mock(async () => ({
	commits: [
		{
			hash: "abc123",
			shortHash: "abc123",
			message: "test commit",
			author: "Test",
			authorEmail: "test@example.com",
			date: "2026-08-08T00:00:00.000Z",
		},
	],
}));

mock.module("renderer/hooks/host-service/useWorkspaceHostUrl", () => ({
	useWorkspaceHostUrl: () => "http://host.test",
}));

mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		git: {
			getStatus: { query: getStatus },
			getBranchSyncStatus: { query: getBranchSyncStatus },
			listCommits: { query: listCommits },
		},
	}),
}));

const { useGitChangesStatus } = await import("./useGitChangesStatus");

describe("useGitChangesStatus", () => {
	test("loads catalog workspaces through host-service instead of legacy local-db", async () => {
		await ensureHappyDom();
		const { renderHook, waitFor } = await import("@testing-library/react/pure");
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const wrapper = ({ children }: { children: ReactNode }) =>
			createElement(QueryClientProvider, { client: queryClient }, children);

		const { result } = renderHook(
			() =>
				useGitChangesStatus({
					workspaceId: "workspace-1",
					worktreePath: "/worktrees/one",
				}),
			{ wrapper },
		);

		await waitFor(() => expect(result.current.status?.branch).toBe("feature"));
		expect(getStatus).toHaveBeenCalledWith({
			workspaceId: "workspace-1",
			priority: "foreground",
		});
		expect(result.current.status?.unstaged.map((file) => file.path)).toEqual([
			"tracked.ts",
		]);
		expect(result.current.status?.untracked.map((file) => file.path)).toEqual([
			"new.ts",
		]);
		expect(result.current.status?.pushCount).toBe(3);
		expect(result.current.status?.commits[0]?.message).toBe("test commit");
	});
});
