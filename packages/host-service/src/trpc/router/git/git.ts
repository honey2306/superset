import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { pullRequests, workspaces } from "../../../db/schema";
import {
	createGitEnvResolver,
	resolveDefaultBranchName,
} from "../../../runtime/git";
import { createUserSimpleGit } from "../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../types";
import { getHostWorkerPool } from "../../../workers/host-worker-pool";
import {
	gitCommitFilesTask,
	gitFetchBaseRefTask,
	gitLogTask,
	gitStatusSnapshotTask,
} from "../../../workers/tasks/git";
import { updateLocalWorkspace } from "../../../workspaces/local-workspace-store";
import { protectedProcedure, queryProcedure, router } from "../../index";
import { resolveGithubRepo } from "../workspace-creation/shared/project-helpers";
import type {
	ChangedFile,
	CheckConclusionState,
	CheckRun,
	CheckStatusState,
	Commit,
	IssueComment,
	MergeableState,
	PullRequestReviewDecision,
	PullRequestReviewThread,
	PullRequestState,
} from "./types";
import { scheduleBaseRefFetch } from "./utils/base-ref-freshness";
import { gitConfigWrite } from "./utils/config-write";
import {
	assertSafeGitPath,
	assertValidCommitRef,
	parseGitStashList,
	parseNameStatus,
} from "./utils/git-changes";
import {
	getDefaultBranchName,
	resolveBaseComparison,
} from "./utils/git-helpers";
import { gitStatusRefreshLimiter } from "./utils/git-status-refresh-limiter";
import {
	type GraphQLThreadsResult,
	parseGraphQLThreads,
	REVIEW_THREADS_QUERY,
} from "./utils/graphql";
import { wouldMergeConflict } from "./utils/merge-preflight";
import { resolveWorktreePath } from "./utils/resolve-worktree";

// Front-door cap for commit-file diffs. Statuses are admitted by
// gitStatusRefreshLimiter; without a cap here, a burst of distinct-commit
// diffs could occupy every pool worker ahead of limiter-admitted statuses.
const MAX_CONCURRENT_COMMIT_FILE_TASKS = 2;
let activeCommitFileTasks = 0;
const commitFileWaiters: (() => void)[] = [];
async function withCommitFilesSlot<T>(fn: () => Promise<T>): Promise<T> {
	if (activeCommitFileTasks >= MAX_CONCURRENT_COMMIT_FILE_TASKS) {
		await new Promise<void>((resolve) => commitFileWaiters.push(resolve));
	}
	activeCommitFileTasks++;
	try {
		return await fn();
	} finally {
		activeCommitFileTasks--;
		commitFileWaiters.shift()?.();
	}
}

// Identical requests share one slot AND one task — deduping outside the
// semaphore keeps same-commit bursts from consuming both cap slots or
// re-running a task that finished while they waited for a slot.
const inFlightCommitFiles = new Map<string, Promise<ChangedFile[]>>();
function runCommitFilesDeduped(
	key: string,
	fn: () => Promise<ChangedFile[]>,
): Promise<ChangedFile[]> {
	const existing = inFlightCommitFiles.get(key);
	if (existing) return existing;
	const task = withCommitFilesSlot(fn).finally(() => {
		inFlightCommitFiles.delete(key);
	});
	inFlightCommitFiles.set(key, task);
	return task;
}

/** Credential env for a worker git task, resolved in-process (the provider
 * can't cross the thread boundary) and passed to the worker as plain data. */
function resolveGitTaskEnv(
	ctx: Pick<HostServiceContext, "credentials">,
	worktreePath: string,
): Promise<Record<string, string>> {
	return createGitEnvResolver(ctx.credentials)(worktreePath);
}

async function assertValidBranchName(
	git: Awaited<ReturnType<HostServiceContext["git"]>>,
	branch: string,
): Promise<void> {
	if (!branch.trim() || branch.startsWith("-")) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid branch name",
		});
	}
	try {
		await git.raw(["check-ref-format", "--branch", branch]);
	} catch {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid branch name",
		});
	}
}

function updateWorkspaceBranch(
	ctx: HostServiceContext,
	workspaceId: string,
	branch: string,
): void {
	updateLocalWorkspace(
		{ db: ctx.db, catalog: ctx.catalog, eventBus: ctx.eventBus },
		workspaceId,
		{ branch },
	);
}

export const gitRouter = router({
	getRemoteUrl: queryProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			const remoteUrl = await git
				.remote(["get-url", "origin"])
				.catch(() => undefined);
			return {
				url: typeof remoteUrl === "string" ? remoteUrl.trim() || null : null,
			};
		}),

	listBranches: queryProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);

			// `%(HEAD)` emits "*" for the checked-out branch, " " otherwise.
			// Single spawn — independent of branch count. Only `name`/`isHead`
			// are read by the v2 sidebar's BaseBranchSelector; the other
			// per-branch fields the previous implementation computed (upstream,
			// ahead/behind, last-commit) cost 4 spawns each and were unused.
			let branches: { name: string; isHead: boolean }[] = [];
			try {
				const raw = await git.raw([
					"for-each-ref",
					"refs/heads/",
					"--format=%(HEAD)\t%(refname:short)",
				]);
				branches = raw
					.trim()
					.split("\n")
					.filter(Boolean)
					.map((line) => {
						const tab = line.indexOf("\t");
						if (tab < 0) return { name: line, isHead: false };
						return {
							isHead: line.slice(0, tab) === "*",
							name: line.slice(tab + 1),
						};
					});
			} catch {}

			let remoteBranches: string[] = [];
			try {
				const raw = await git.raw([
					"for-each-ref",
					"refs/remotes/origin/",
					"--format=%(refname:short)",
				]);
				remoteBranches = raw
					.trim()
					.split("\n")
					.filter((name) => name && name !== "origin" && name !== "origin/HEAD")
					.map((name) => name.replace(/^origin\//, ""));
			} catch {}

			return { branches, remoteBranches };
		}),

	fetchBranches: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			await git.fetch(["--all", "--prune"]);
			return { success: true };
		}),

	fetchCurrentBranch: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const git = await ctx.git(resolveWorktreePath(ctx, input.workspaceId));
			await git.fetch(["--all", "--prune"]);
			return { success: true };
		}),

	pullCurrentBranch: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const git = await ctx.git(resolveWorktreePath(ctx, input.workspaceId));
			await git.pull(["--rebase"]);
			return { success: true };
		}),

	pushCurrentBranch: protectedProcedure
		.input(z.object({ workspaceId: z.string(), setUpstream: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const git = await ctx.git(resolveWorktreePath(ctx, input.workspaceId));
			const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
			if (!branch || branch === "HEAD") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cannot push from detached HEAD",
				});
			}
			const hasUpstream = await git
				.raw(["rev-parse", "--abbrev-ref", "@{upstream}"])
				.then(() => true)
				.catch(() => false);
			await git.push(
				input.setUpstream && !hasUpstream ? ["-u", "origin", branch] : [],
			);
			return { success: true };
		}),

	switchBranch: protectedProcedure
		.input(z.object({ workspaceId: z.string(), branch: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			await assertValidBranchName(git, input.branch);
			await git.raw(["switch", input.branch]);
			updateWorkspaceBranch(ctx, input.workspaceId, input.branch);
			return { success: true };
		}),

	createBranch: protectedProcedure
		.input(z.object({ workspaceId: z.string(), branch: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			await assertValidBranchName(git, input.branch);
			await git.raw(["switch", "-c", input.branch]);
			updateWorkspaceBranch(ctx, input.workspaceId, input.branch);
			return { success: true };
		}),

	checkoutRemoteBranch: protectedProcedure
		.input(z.object({ workspaceId: z.string(), branch: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			await assertValidBranchName(git, input.branch);
			await git.raw(["switch", "--track", `origin/${input.branch}`]);
			updateWorkspaceBranch(ctx, input.workspaceId, input.branch);
			return { success: true };
		}),

	pullBranch: protectedProcedure
		.input(z.object({ workspaceId: z.string(), branch: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			await assertValidBranchName(git, input.branch);

			const currentBranch = (
				await git.revparse(["--abbrev-ref", "HEAD"])
			).trim();
			if (currentBranch === input.branch) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Use the current branch pull action for this branch",
				});
			}

			const tracking = (
				await git.raw([
					"for-each-ref",
					"--format=%(upstream:remotename)%09%(upstream:remoteref)%09%(upstream)",
					`refs/heads/${input.branch}`,
				])
			).trim();
			const [remote, remoteRef, upstreamRef] = tracking.split("\t");
			if (!remote || !remoteRef || !upstreamRef) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `Branch ${input.branch} has no upstream branch`,
				});
			}

			// Fetch directly into the non-current local ref. Git only permits a
			// fast-forward here and refuses branches checked out by another worktree,
			// so this cannot disturb either the current worktree or another workspace.
			await git.raw([
				"fetch",
				remote,
				`${remoteRef}:${upstreamRef}`,
				`${remoteRef}:refs/heads/${input.branch}`,
			]);
			return { success: true };
		}),

	mergeBranch: protectedProcedure
		.input(z.object({ workspaceId: z.string(), branch: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			await assertValidBranchName(git, input.branch);
			if (await wouldMergeConflict(git, input.branch)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `Merging ${input.branch} would produce conflicts`,
				});
			}
			try {
				await git.raw(["merge", "--", input.branch]);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (message.toLowerCase().includes("conflict")) {
					// A ref or the worktree changed between preflight and merge. Restore the
					// pre-merge state so callers retain the same no-conflict-side-effects
					// guarantee as the normal preflight path.
					await git.raw(["merge", "--abort"]).catch(() => {});
					throw new TRPCError({ code: "CONFLICT", message });
				}
				throw error;
			}
			return { success: true };
		}),

	getStatus: queryProcedure
		.meta({ timeoutMs: 15_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				baseBranch: z.string().optional(),
				priority: z.enum(["foreground", "background"]).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const requestKey = JSON.stringify({
				baseBranch: input.baseBranch ?? null,
			});
			return gitStatusRefreshLimiter.run({
				workspaceId: input.workspaceId,
				requestKey,
				priority: input.priority,
				run: async () => {
					const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
					const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
					const workerPool = getHostWorkerPool();
					const result = await workerPool.run(
						gitStatusSnapshotTask,
						{ worktreePath, baseBranch: input.baseBranch, gitEnv },
						{ timeoutMs: 15_000 },
					);
					if (result.baseRefFetchTarget) {
						const target = result.baseRefFetchTarget;
						const coordinatorGit =
							createUserSimpleGit(worktreePath).env(gitEnv);
						// The coordinator maps live in this process, not in individual
						// workers, so worktrees sharing one common Git dir share one TTL
						// and in-flight fetch. The network fetch itself remains off-loop.
						scheduleBaseRefFetch(coordinatorGit, worktreePath, target, () =>
							workerPool.run(
								gitFetchBaseRefTask,
								{ worktreePath, target, gitEnv },
								{
									timeoutMs: 30_000,
									strategy: "coalesce",
									dedupeKey: `${worktreePath}:base-ref:${target.remote}/${target.branch}`,
								},
							),
						);
					}
					return result.snapshot;
				},
			});
		}),

	listCommits: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				baseBranch: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);

			const base = await resolveBaseComparison(git, input.baseBranch);
			const baseRef = base?.baseRef ?? "HEAD";

			const commits: Commit[] = [];
			try {
				const raw = await git.raw([
					"log",
					`${baseRef}..HEAD`,
					"--format=%H\t%h\t%s\t%an\t%ae\t%aI",
				]);
				for (const line of raw.trim().split("\n")) {
					if (!line) continue;
					const [hash, shortHash, message, author, authorEmail, date] =
						line.split("\t");
					commits.push({
						hash: hash ?? "",
						shortHash: shortHash ?? "",
						message: message ?? "",
						author: author ?? "",
						authorEmail: authorEmail ?? "",
						date: date ?? "",
					});
				}
			} catch {}

			return { commits };
		}),

	getCommitFiles: queryProcedure
		.meta({ timeoutMs: 15_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				commitHash: z.string(),
				fromHash: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			const dedupeKey = `${input.workspaceId}:commit-files:${input.fromHash ?? ""}:${input.commitHash}`;
			const files = await runCommitFilesDeduped(dedupeKey, () =>
				getHostWorkerPool().run(
					gitCommitFilesTask,
					{
						worktreePath,
						commitHash: input.commitHash,
						fromHash: input.fromHash,
						gitEnv,
					},
					{
						timeoutMs: 15_000,
						strategy: "coalesce",
						dedupeKey,
					},
				),
			);

			return { files };
		}),

	getBaseBranch: queryProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			const currentBranch = (
				await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
			).trim();
			if (!currentBranch || currentBranch === "HEAD") {
				return { baseBranch: null as string | null };
			}
			const configured = (
				await git
					.raw(["config", `branch.${currentBranch}.base`])
					.catch(() => "")
			).trim();
			return { baseBranch: (configured || null) as string | null };
		}),

	setBaseBranch: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				baseBranch: z.string().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			const currentBranch = (
				await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
			).trim();
			if (!currentBranch || currentBranch === "HEAD") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cannot set base branch on detached HEAD",
				});
			}
			if (input.baseBranch) {
				await gitConfigWrite(git, [
					"config",
					`branch.${currentBranch}.base`,
					input.baseBranch,
				]);
			} else {
				await gitConfigWrite(git, [
					"config",
					"--unset",
					`branch.${currentBranch}.base`,
				]).catch(() => {});
			}
			return { baseBranch: input.baseBranch };
		}),

	renameBranch: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				oldName: z.string(),
				newName: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);

			// Check if branch has been pushed to remote
			try {
				const remote = await git.raw([
					"ls-remote",
					"--heads",
					"origin",
					input.oldName,
				]);
				if (remote.trim()) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "Cannot rename a branch that has been pushed to remote",
					});
				}
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				// ls-remote failed — probably no remote, safe to rename
			}

			await git.raw(["branch", "-m", input.oldName, input.newName]);
			return { name: input.newName };
		}),

	commit: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				message: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const git = await ctx.git(resolveWorktreePath(ctx, input.workspaceId));
			const result = await git.commit(input.message);
			return { success: true, hash: result.commit };
		}),

	stageFiles: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				filePaths: z.array(z.string()).min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			for (const filePath of input.filePaths) assertSafeGitPath(filePath);
			const git = await ctx.git(resolveWorktreePath(ctx, input.workspaceId));
			await git.raw(["add", "--", ...input.filePaths]);
			return { success: true };
		}),

	unstageFiles: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				filePaths: z.array(z.string()).min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			for (const filePath of input.filePaths) assertSafeGitPath(filePath);
			const git = await ctx.git(resolveWorktreePath(ctx, input.workspaceId));
			await git.raw(["reset", "HEAD", "--", ...input.filePaths]);
			return { success: true };
		}),

	discardFiles: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				filePaths: z.array(z.string()).min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			for (const filePath of input.filePaths) assertSafeGitPath(filePath);
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			const untracked = new Set((await git.status()).not_added);
			const trackedPaths = input.filePaths.filter(
				(path) => !untracked.has(path),
			);
			if (trackedPaths.length > 0) {
				await git.raw(["checkout", "--", ...trackedPaths]);
			}
			await Promise.all(
				input.filePaths
					.filter((path) => untracked.has(path))
					.map((path) =>
						rm(join(worktreePath, path), { recursive: true, force: true }),
					),
			);
			return { success: true };
		}),

	resetToCommit: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				commit: z.string(),
				mode: z.enum(["soft", "mixed", "hard"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertValidCommitRef(input.commit);
			const git = await ctx.git(resolveWorktreePath(ctx, input.workspaceId));
			await git.raw(["rev-parse", "--verify", `${input.commit}^{commit}`]);
			await git.raw(["reset", `--${input.mode}`, input.commit]);
			return { success: true };
		}),

	listLog: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				limit: z.number().int().min(1).max(500).default(50),
				skip: z.number().int().min(0).default(0),
				grep: z.string().optional(),
				author: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			return getHostWorkerPool().run(
				gitLogTask,
				{
					worktreePath,
					gitEnv: await resolveGitTaskEnv(ctx, worktreePath),
					limit: input.limit,
					skip: input.skip,
					grep: input.grep,
					author: input.author,
				},
				{ timeoutMs: 30_000 },
			);
		}),

	getFileHistory: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				filePath: z.string(),
				limit: z.number().int().min(1).max(200).default(100),
			}),
		)
		.query(async ({ ctx, input }) => {
			assertSafeGitPath(input.filePath);
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			return getHostWorkerPool().run(
				gitLogTask,
				{
					worktreePath,
					gitEnv: await resolveGitTaskEnv(ctx, worktreePath),
					limit: input.limit,
					filePath: input.filePath,
				},
				{ timeoutMs: 30_000 },
			);
		}),

	stash: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const git = await ctx.git(resolveWorktreePath(ctx, input.workspaceId));
			await git.raw(["stash", "push"]);
			return { success: true };
		}),

	stashIncludeUntracked: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const git = await ctx.git(resolveWorktreePath(ctx, input.workspaceId));
			await git.raw(["stash", "push", "--include-untracked"]);
			return { success: true };
		}),

	stashPop: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const git = await ctx.git(resolveWorktreePath(ctx, input.workspaceId));
			await git.raw(["stash", "pop"]);
			return { success: true };
		}),

	stashList: queryProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ ctx, input }) => {
			const git = await ctx.git(resolveWorktreePath(ctx, input.workspaceId));
			return parseGitStashList(
				await git.raw(["stash", "list", "--format=%gd%x1f%gs%x1f%at"]),
			);
		}),

	stashApplyAt: protectedProcedure
		.input(
			z.object({ workspaceId: z.string(), index: z.number().int().min(0) }),
		)
		.mutation(async ({ ctx, input }) => {
			const git = await ctx.git(resolveWorktreePath(ctx, input.workspaceId));
			await git.raw(["stash", "apply", `stash@{${input.index}}`]);
			return { success: true };
		}),

	stashPopAt: protectedProcedure
		.input(
			z.object({ workspaceId: z.string(), index: z.number().int().min(0) }),
		)
		.mutation(async ({ ctx, input }) => {
			const git = await ctx.git(resolveWorktreePath(ctx, input.workspaceId));
			await git.raw(["stash", "pop", `stash@{${input.index}}`]);
			return { success: true };
		}),

	stashDropAt: protectedProcedure
		.input(
			z.object({ workspaceId: z.string(), index: z.number().int().min(0) }),
		)
		.mutation(async ({ ctx, input }) => {
			const git = await ctx.git(resolveWorktreePath(ctx, input.workspaceId));
			await git.raw(["stash", "drop", `stash@{${input.index}}`]);
			return { success: true };
		}),

	stashFiles: queryProcedure
		.input(
			z.object({ workspaceId: z.string(), index: z.number().int().min(0) }),
		)
		.query(async ({ ctx, input }) => {
			const git = await ctx.git(resolveWorktreePath(ctx, input.workspaceId));
			return parseNameStatus(
				await git.raw([
					"stash",
					"show",
					"--name-status",
					"--no-color",
					`stash@{${input.index}}`,
				]),
			);
		}),

	createPullRequest: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				allowOutOfDate: z.boolean().optional().default(false),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
			if (!branch || branch === "HEAD") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cannot create a pull request from detached HEAD",
				});
			}

			const upstream = await git
				.raw(["rev-parse", "--abbrev-ref", "@{upstream}"])
				.then((value) => value.trim())
				.catch(() => "");
			if (upstream) {
				const [pullCount, pushCount] = (
					await git.raw([
						"rev-list",
						"--left-right",
						"--count",
						"@{upstream}...HEAD",
					])
				)
					.trim()
					.split(/\s+/)
					.map((value) => Number.parseInt(value, 10));
				if ((pullCount ?? 0) > 0 && !input.allowOutOfDate) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: `Branch is behind upstream by ${pullCount} commit${pullCount === 1 ? "" : "s"}. Pull/rebase first, or continue anyway.`,
					});
				}
				if ((pushCount ?? 0) > 0) await git.push();
			} else {
				await git.raw([
					"push",
					"--set-upstream",
					"origin",
					`HEAD:refs/heads/${branch}`,
				]);
			}

			const upstreamRef = (
				await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"])
			).trim();
			const separator = upstreamRef.indexOf("/");
			const remoteName =
				separator > 0 ? upstreamRef.slice(0, separator) : "origin";
			const headBranch =
				separator > 0 ? upstreamRef.slice(separator + 1) : branch;
			const remoteUrl = (
				await git.raw(["remote", "get-url", remoteName])
			).trim();
			const headRepo = parseGitHubRemote(remoteUrl);
			if (!headRepo) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "GitHub is not available for this workspace",
				});
			}

			const resolvedRepo = await resolveGithubRepo(ctx, workspace.projectId);
			const octokit = await ctx.github();
			const { data: repoData } = await octokit.repos.get({
				owner: resolvedRepo.owner,
				repo: resolvedRepo.name,
			});
			const baseOwner =
				repoData.fork && repoData.parent
					? repoData.parent.owner.login
					: resolvedRepo.owner;
			const baseRepo =
				repoData.fork && repoData.parent
					? repoData.parent.name
					: resolvedRepo.name;
			const baseBranch =
				(
					await git
						.raw(["config", "--get", `branch.${branch}.gh-merge-base`])
						.catch(() => "")
				).trim() ||
				repoData.parent?.default_branch ||
				repoData.default_branch ||
				(await resolveDefaultBranchName(git));
			const { data: existing } = await octokit.pulls.list({
				owner: baseOwner,
				repo: baseRepo,
				head: `${headRepo.owner}:${headBranch}`,
				state: "open",
				per_page: 1,
			});
			const url =
				existing[0]?.html_url ??
				`https://github.com/${baseOwner}/${baseRepo}/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(headRepo.owner)}:${encodeURIComponent(headBranch)}?expand=1`;
			await ctx.runtime.pullRequests
				.refreshPullRequestsByWorkspaces([input.workspaceId])
				.catch(() => {});
			return { success: true, url };
		}),

	discardChanges: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				filePath: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertSafeGitPath(input.filePath);
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			const status = await git.status();
			const isUntracked = status.not_added.includes(input.filePath);
			if (isUntracked) {
				await rm(join(worktreePath, input.filePath), { force: true });
			} else {
				await git.raw(["checkout", "HEAD", "--", input.filePath]);
			}
			return { success: true };
		}),

	discardAllUnstaged: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			await git.raw(["checkout", "--", "."]);
			await git.raw(["clean", "-fd"]);
			return { success: true };
		}),

	discardAllStaged: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			const status = await git.status();

			// Files with a staged change (index entry differs from HEAD).
			const stagedFiles = status.files.filter(
				(f) => f.index !== " " && f.index !== "?",
			);

			const checkoutHeadPaths: string[] = [];
			const resetPaths: string[] = [];
			const deletePaths: string[] = [];

			for (const f of stagedFiles) {
				if (f.index === "A") {
					// Staged-as-added: not in HEAD. Unstage + delete.
					resetPaths.push(f.path);
					deletePaths.push(f.path);
				} else if (f.index === "R") {
					// Staged rename: index has both delete-of-old and add-of-new.
					// Unstage both ends, restore old from HEAD, delete new.
					resetPaths.push(f.path);
					deletePaths.push(f.path);
					if (f.from) {
						resetPaths.push(f.from);
						checkoutHeadPaths.push(f.from);
					}
				} else if (f.index === "C") {
					// Staged copy: source unchanged, dest is new in index.
					resetPaths.push(f.path);
					deletePaths.push(f.path);
				} else {
					// M, D, T: exists in HEAD; checkout reverts both index and WT.
					checkoutHeadPaths.push(f.path);
				}
			}

			if (resetPaths.length > 0) {
				await git.raw(["reset", "HEAD", "--", ...resetPaths]);
			}
			if (checkoutHeadPaths.length > 0) {
				await git.raw(["checkout", "HEAD", "--", ...checkoutHeadPaths]);
			}
			for (const filePath of deletePaths) {
				await rm(join(worktreePath, filePath), { force: true });
			}
			return { success: true };
		}),

	stageAll: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			await git.raw(["add", "-A"]);
			return { success: true };
		}),

	unstageAll: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			await git.raw(["reset", "HEAD"]);
			return { success: true };
		}),

	getDiff: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				path: z.string(),
				oldPath: z.string().optional(),
				category: z.enum(["against-base", "staged", "unstaged", "commit"]),
				baseBranch: z.string().optional(),
				commitHash: z.string().optional(),
				fromHash: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			assertSafeGitPath(input.path);
			if (input.oldPath) assertSafeGitPath(input.oldPath);
			const originalPath = input.oldPath ?? input.path;
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);

			let originalContent = "";
			let modifiedContent = "";

			if (input.category === "against-base") {
				const base = await resolveBaseComparison(git, input.baseBranch);
				const baseRef = base?.baseRef ?? "HEAD";
				// Use the merge base so the diff excludes unrelated changes
				// landed on the base branch after we forked — matches what the
				// file list (3-dot diff) is already filtered by.
				const originRef = await git
					.raw(["merge-base", baseRef, "HEAD"])
					.then((s) => s.trim())
					.catch(() => baseRef);
				try {
					originalContent = await git.show([`${originRef}:${originalPath}`]);
				} catch {}
				try {
					modifiedContent = await git.show([`HEAD:${input.path}`]);
				} catch {}
			} else if (input.category === "staged") {
				try {
					originalContent = await git.show([`HEAD:${originalPath}`]);
				} catch {}
				try {
					modifiedContent = await git.show([`:0:${input.path}`]);
				} catch {}
			} else if (input.category === "commit") {
				if (!input.commitHash) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "commitHash is required for commit diffs",
					});
				}
				const from = input.fromHash ?? `${input.commitHash}^`;
				try {
					originalContent = await git.show([`${from}:${originalPath}`]);
				} catch {}
				try {
					modifiedContent = await git.show([
						`${input.commitHash}:${input.path}`,
					]);
				} catch {}
			} else {
				// Unstaged: compare index (staged version) against working tree
				// If file isn't in index (untracked), originalContent stays empty = "new file"
				try {
					originalContent = await git.show([`:0:${originalPath}`]);
				} catch {}
				try {
					modifiedContent = await readFile(
						`${worktreePath}/${input.path}`,
						"utf-8",
					);
				} catch {}
			}

			const oldFileName = originalPath.split("/").pop() ?? originalPath;
			const newFileName = input.path.split("/").pop() ?? input.path;
			return {
				oldFile: { name: oldFileName, contents: originalContent },
				newFile: { name: newFileName, contents: modifiedContent },
			};
		}),

	getBranchSyncStatus: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);

			const currentBranch = (
				await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
			).trim();
			const isDetached = !currentBranch || currentBranch === "HEAD";

			const defaultBranch = await getDefaultBranchName(git);
			const isDefaultBranch =
				!isDetached && !!defaultBranch && currentBranch === defaultBranch;

			const remotes = await git.getRemotes(false).catch(() => []);
			const hasRepo = remotes.length > 0;

			let hasUpstream = false;
			let pushCount = 0;
			let pullCount = 0;
			try {
				await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"]);
				hasUpstream = true;
				const tracking = await git.raw([
					"rev-list",
					"--left-right",
					"--count",
					"@{upstream}...HEAD",
				]);
				const [pullStr, pushStr] = tracking.trim().split(/\s+/);
				pullCount = Number.parseInt(pullStr || "0", 10);
				pushCount = Number.parseInt(pushStr || "0", 10);
			} catch {
				// no upstream — counts stay zero
			}

			// Read working-tree status separately from branch info so a transient
			// `git status` failure (e.g. lock contention during a concurrent
			// operation) doesn't poison the whole sync read. Log on failure so it
			// isn't silent — `hasUncommitted` defaults to false in that case
			// because over-reporting "uncommitted" on every blip is more annoying
			// than under-reporting briefly until the next refetch.
			let hasUncommitted = false;
			try {
				const status = await git.status();
				hasUncommitted = status.files.length > 0;
			} catch (error) {
				console.warn(
					"[git/getBranchSyncStatus] git.status() failed; treating working tree as clean for this read",
					error,
				);
			}

			return {
				hasRepo,
				hasUpstream,
				pushCount,
				pullCount,
				isDefaultBranch,
				isDetached,
				hasUncommitted,
				currentBranch: isDetached ? null : currentBranch,
				defaultBranch,
			};
		}),

	getPullRequest: queryProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			if (!workspace.pullRequestId) return null;

			const pr = ctx.db.query.pullRequests
				.findFirst({ where: eq(pullRequests.id, workspace.pullRequestId) })
				.sync();
			if (!pr) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Pull request ${workspace.pullRequestId} not found in database`,
				});
			}

			let checks: CheckRun[] = [];
			try {
				const parsed = JSON.parse(pr.checksJson);
				if (Array.isArray(parsed)) {
					checks = parsed.map(
						(c: Record<string, unknown>): CheckRun => ({
							name: (c.name as string) ?? "",
							status: ((c.status as string) ?? "completed") as CheckStatusState,
							conclusion: (c.conclusion ?? null) as CheckConclusionState | null,
							detailsUrl: (c.url as string) ?? null,
							startedAt: (c.startedAt as string) ?? null,
							completedAt: (c.completedAt as string) ?? null,
						}),
					);
				}
			} catch {}

			return {
				number: pr.prNumber,
				url: pr.url,
				title: pr.title,
				body: null as string | null,
				state: pr.state as PullRequestState,
				isDraft: pr.isDraft ?? false,
				reviewDecision: (pr.reviewDecision ??
					null) as PullRequestReviewDecision | null,
				mergeable: "unknown" as MergeableState,
				headRefName: pr.headBranch ?? "",
				updatedAt: pr.updatedAt ? new Date(pr.updatedAt).toISOString() : "",
				checks,
				repoOwner: pr.repoOwner,
				repoName: pr.repoName,
			};
		}),

	getCheckJobLogs: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(z.object({ workspaceId: z.string(), detailsUrl: z.string() }))
		.query(async ({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!workspace?.pullRequestId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace has no associated pull request",
				});
			}

			const pr = ctx.db.query.pullRequests
				.findFirst({ where: eq(pullRequests.id, workspace.pullRequestId) })
				.sync();
			if (!pr) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Pull request ${workspace.pullRequestId} not found in database`,
				});
			}

			// GitHub Actions check details URLs look like
			// https://github.com/<owner>/<repo>/actions/runs/<run_id>/job/<job_id>
			const isGithubUrl =
				URL.canParse(input.detailsUrl) &&
				new URL(input.detailsUrl).hostname === "github.com";
			const jobId = isGithubUrl
				? input.detailsUrl.match(/\/job\/(\d+)/)?.[1]
				: undefined;
			if (!jobId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Check is not a GitHub Actions job with downloadable logs",
				});
			}

			const octokit = await ctx.github();
			const { data } = await octokit.rest.actions.downloadJobLogsForWorkflowRun(
				{
					owner: pr.repoOwner,
					repo: pr.repoName,
					job_id: Number(jobId),
				},
			);
			return { logs: typeof data === "string" ? data : String(data) };
		}),

	getPullRequestThreads: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			if (!workspace.pullRequestId) {
				return { reviewThreads: [], conversationComments: [] };
			}

			const pr = ctx.db.query.pullRequests
				.findFirst({ where: eq(pullRequests.id, workspace.pullRequestId) })
				.sync();
			if (!pr) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Pull request ${workspace.pullRequestId} not found in database`,
				});
			}

			let repo: { owner: string; name: string };
			try {
				repo = await resolveGithubRepo(ctx, workspace.projectId);
			} catch (err) {
				// Expected resolver failures (project not set up locally, no
				// GitHub remote) degrade silently — the review tab just stays
				// empty. Anything else is a real bug; propagate it.
				if (err instanceof TRPCError) {
					return { reviewThreads: [], conversationComments: [] };
				}
				throw err;
			}

			const octokit = await ctx.github();

			let reviewThreads: PullRequestReviewThread[] = [];
			try {
				const result: GraphQLThreadsResult = await octokit.graphql(
					REVIEW_THREADS_QUERY,
					{
						owner: repo.owner,
						name: repo.name,
						prNumber: pr.prNumber,
					},
				);
				reviewThreads = parseGraphQLThreads(result);
			} catch (error) {
				console.warn(
					"[git.getPullRequestThreads] Failed to fetch review threads:",
					error,
				);
			}

			const conversationComments: IssueComment[] = [];
			try {
				let page = 1;
				let hasMore = true;
				while (hasMore) {
					const { data: comments } = await octokit.issues.listComments({
						owner: repo.owner,
						repo: repo.name,
						issue_number: pr.prNumber,
						per_page: 100,
						page,
					});
					for (const c of comments) {
						const body = c.body?.trim();
						if (!body) continue;
						conversationComments.push({
							id: c.id,
							user: {
								login: c.user?.login ?? "ghost",
								avatarUrl: c.user?.avatar_url ?? "",
							},
							body,
							createdAt: c.created_at ?? "",
							htmlUrl: c.html_url ?? "",
						});
					}
					hasMore = comments.length === 100;
					page++;
				}
			} catch (error) {
				console.warn(
					"[git.getPullRequestThreads] Failed to fetch conversation comments:",
					error,
				);
			}

			return { reviewThreads, conversationComments };
		}),

	setReviewThreadResolution: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				threadId: z.string(),
				resolved: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}

			const octokit = await ctx.github();
			const mutation = input.resolved
				? `mutation($threadId: ID!) {
					resolveReviewThread(input: {threadId: $threadId}) {
						thread { id isResolved }
					}
				}`
				: `mutation($threadId: ID!) {
					unresolveReviewThread(input: {threadId: $threadId}) {
						thread { id isResolved }
					}
				}`;

			try {
				await octokit.graphql(mutation, { threadId: input.threadId });
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "GraphQL mutation failed";
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
			}

			return { threadId: input.threadId, isResolved: input.resolved };
		}),
});
