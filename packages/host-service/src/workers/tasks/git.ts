// git/* worker tasks. Handlers build their own SimpleGit — the worker spawns
// the git subprocesses itself, so stdout draining AND parsing leave the
// host-service event loop. Credential env is resolved in-process (it needs
// the credential provider) and crosses as plain data.

import { createUserSimpleGit } from "../../runtime/git/simple-git.ts";
import type { ChangedFile } from "../../trpc/router/git/types.ts";
import type { BaseRefFetchTarget } from "../../trpc/router/git/utils/base-ref-freshness.ts";
import {
	type GitLogEntry,
	parseGitLog,
} from "../../trpc/router/git/utils/git-changes.ts";
import { getChangedFilesForDiff } from "../../trpc/router/git/utils/git-helpers.ts";
import type { GitStatusSnapshotComputation } from "../../trpc/router/git/utils/git-status.ts";
import { getGitStatusSnapshot } from "../../trpc/router/git/utils/git-status.ts";
import {
	normalizeWorktreePath,
	parseWorktreeList,
} from "../../trpc/router/workspace-creation/shared/worktree-list.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

export interface GitTaskEnv {
	[key: string]: string;
}

export const gitStatusSnapshotTask = defineWorkerTask<
	{ worktreePath: string; baseBranch?: string; gitEnv: GitTaskEnv },
	GitStatusSnapshotComputation
>({
	type: "git/getStatusSnapshot",
	handler: async ({ worktreePath, baseBranch, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		return getGitStatusSnapshot({ git, worktreePath, baseBranch });
	},
});

export const gitFetchBaseRefTask = defineWorkerTask<
	{
		worktreePath: string;
		target: BaseRefFetchTarget;
		gitEnv: GitTaskEnv;
	},
	void
>({
	type: "git/fetchBaseRef",
	handler: async ({ worktreePath, target, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		await git.fetch([target.remote, target.branch, "--quiet", "--no-tags"]);
	},
});

export const gitCommitFilesTask = defineWorkerTask<
	{
		worktreePath: string;
		commitHash: string;
		fromHash?: string;
		gitEnv: GitTaskEnv;
	},
	ChangedFile[]
>({
	type: "git/getCommitFiles",
	handler: async ({ worktreePath, commitHash, fromHash, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		const from = fromHash ? fromHash : `${commitHash}^`;
		return getChangedFilesForDiff(git, [from, commitHash]);
	},
});

/** Potentially large history reads stay off the host-service event loop. */
export const gitLogTask = defineWorkerTask<
	{
		worktreePath: string;
		gitEnv: GitTaskEnv;
		limit: number;
		skip?: number;
		grep?: string;
		author?: string;
		all?: boolean;
		filePath?: string;
	},
	GitLogEntry[]
>({
	type: "git/listLog",
	handler: async ({
		worktreePath,
		gitEnv,
		limit,
		skip,
		grep,
		author,
		all,
		filePath,
	}) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		const args = [
			"log",
			"--topo-order",
			`--max-count=${limit}`,
			"--no-color",
			"--decorate=short",
			// Use a separator that Git ref names cannot contain. `%D`'s default
			// comma separator corrupts valid refs such as `feature,comma`.
			"--format=%H%x1f%h%x1f%P%x1f%(decorate:separator=%x1d)%x1f%S%x1f%s%x1f%an%x1f%at%x1e",
		];
		// File history is intentionally scoped to the path's reachable history;
		// `--all` is reserved for the repository-wide History tab.
		if (all && !filePath) args.push("--all");
		if (skip !== undefined) args.push(`--skip=${skip}`);
		if (grep) args.push("--fixed-strings", `--grep=${grep}`);
		if (author) args.push("--fixed-strings", `--author=${author}`);
		if (filePath) args.push("--follow", "--", filePath);
		return parseGitLog(await git.raw(args));
	},
});

/** Git reads used by delete preview/preflight. Kept together so even a large
 * repository's status walk never blocks all host-service tRPC traffic. */
export const gitWorktreeStateTask = defineWorkerTask<
	{ worktreePath: string; gitEnv: GitTaskEnv },
	{ hasChanges: boolean; hasUnpushedCommits: boolean }
>({
	type: "git/worktreeState",
	handler: async ({ worktreePath, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		const status = await git.status();
		let hasUnpushedCommits = false;
		try {
			const result = await git.raw([
				"rev-list",
				"--count",
				"HEAD",
				"--not",
				"--remotes",
			]);
			const count = Number.parseInt(result.trim(), 10);
			hasUnpushedCommits = Number.isFinite(count) && count > 0;
		} catch {
			// No upstream/readable history is not itself an unsafe delete signal.
		}
		return { hasChanges: !status.isClean(), hasUnpushedCommits };
	},
});

export const gitWorktreeRemoveTask = defineWorkerTask<
	{ repoPath: string; worktreePath: string; gitEnv: GitTaskEnv },
	{ stillRegistered: boolean }
>({
	type: "git/removeWorktree",
	handler: async ({ repoPath, worktreePath, gitEnv }) => {
		const git = createUserSimpleGit(repoPath).env(gitEnv);
		const target = normalizeWorktreePath(worktreePath);
		await git
			.raw(["worktree", "remove", "--force", "--force", target])
			.catch(() => {});
		const raw = await git.raw(["worktree", "list", "--porcelain"]);
		return {
			stillRegistered: parseWorktreeList(raw).some(
				(worktree) => normalizeWorktreePath(worktree.path) === target,
			),
		};
	},
});

export const gitDeleteBranchTask = defineWorkerTask<
	{ repoPath: string; branch: string; gitEnv: GitTaskEnv },
	{ deleted: boolean }
>({
	type: "git/deleteLocalBranch",
	handler: async ({ repoPath, branch, gitEnv }) => {
		const git = createUserSimpleGit(repoPath).env(gitEnv);
		const listed = await git.raw(["branch", "--list", branch]);
		if (!listed.trim()) return { deleted: false };
		await git.raw(["branch", "-D", branch]);
		return { deleted: true };
	},
});

export const gitTasks = [
	gitStatusSnapshotTask,
	gitFetchBaseRefTask,
	gitCommitFilesTask,
	gitLogTask,
	gitWorktreeStateTask,
	gitWorktreeRemoveTask,
	gitDeleteBranchTask,
];
