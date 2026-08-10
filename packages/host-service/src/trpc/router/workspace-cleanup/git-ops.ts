import { createGitEnvResolver } from "../../../runtime/git";
import type { HostServiceContext } from "../../../types";
import { getHostWorkerPool } from "../../../workers/host-worker-pool";
import {
	type GitTaskEnv,
	gitDeleteBranchTask,
	gitWorktreeRemoveTask,
	gitWorktreeStateTask,
} from "../../../workers/tasks/git";
import {
	WorkerTaskAbortedError,
	WorkerTaskError,
} from "../../../workers/WorkerTaskRunner";

export function isIndeterminateGitTaskFailure(error: unknown): boolean {
	return (
		error instanceof WorkerTaskAbortedError ||
		(error instanceof WorkerTaskError && error.name === "WorkerTaskError")
	);
}

/** Mutable seam for focused cleanup tests; keeps git subprocesses off-loop. */
export const cleanupGitOps = {
	resolveGitEnv(
		ctx: Pick<HostServiceContext, "credentials">,
		repoPath: string,
	): Promise<GitTaskEnv> {
		return createGitEnvResolver(ctx.credentials)(repoPath);
	},
	readWorktreeState(
		input: { worktreePath: string; gitEnv: GitTaskEnv },
		signal?: AbortSignal,
	): Promise<{ hasChanges: boolean; hasUnpushedCommits: boolean }> {
		return getHostWorkerPool().run(gitWorktreeStateTask, input, {
			timeoutMs: 15_000,
			signal,
		});
	},
	removeWorktree(input: {
		repoPath: string;
		worktreePath: string;
		gitEnv: GitTaskEnv;
	}): Promise<{ stillRegistered: boolean }> {
		return getHostWorkerPool().run(gitWorktreeRemoveTask, input, {
			timeoutMs: 120_000,
		});
	},
	deleteLocalBranch(input: {
		repoPath: string;
		branch: string;
		gitEnv: GitTaskEnv;
	}): Promise<{ deleted: boolean }> {
		return getHostWorkerPool().run(gitDeleteBranchTask, input);
	},
};
