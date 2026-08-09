import { runWithPostCheckoutHookTolerance } from "../../utils/git-hook-tolerance";
import { getCurrentBranch } from "../../workspaces/utils/git";
import { getSimpleGitWithShellPath } from "../../workspaces/utils/git-client";
import {
	assertRegisteredWorktree,
	assertValidGitPath,
} from "./path-validation";

/**
 * Git command helpers with semantic naming.
 *
 * Design principle: Different functions for different git semantics.
 * You can't accidentally use file checkout syntax for branch switching.
 *
 * Each function:
 * 1. Validates worktree is registered
 * 2. Validates paths/refs as appropriate
 * 3. Uses the correct git command syntax
 */

async function getGitWithShellPath(worktreePath: string) {
	return getSimpleGitWithShellPath(worktreePath);
}

async function isCurrentBranch({
	worktreePath,
	expectedBranch,
}: {
	worktreePath: string;
	expectedBranch: string;
}): Promise<boolean> {
	try {
		const currentBranch = await getCurrentBranch(worktreePath);
		return currentBranch === expectedBranch;
	} catch {
		return false;
	}
}

/**
 * Switch to a branch.
 *
 * Uses `git switch` (unambiguous branch operation, git 2.23+).
 * Falls back to `git checkout <branch>` for older git versions.
 *
 * Note: `git checkout -- <branch>` is WRONG - that's file checkout syntax.
 */
export async function gitSwitchBranch(
	worktreePath: string,
	branch: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertValidBranchName(branch);

	const git = await getGitWithShellPath(worktreePath);

	await runWithPostCheckoutHookTolerance({
		context: `Switched branch to "${branch}" in ${worktreePath}`,
		run: async () => {
			try {
				// Prefer `git switch` - unambiguous branch operation (git 2.23+)
				await git.raw(["switch", branch]);
			} catch (switchError) {
				// Check if it's because `switch` command doesn't exist (old git < 2.23)
				// Git outputs: "git: 'switch' is not a git command. See 'git --help'."
				const errorMessage = String(switchError);
				if (errorMessage.includes("is not a git command")) {
					// Fallback for older git versions
					// Note: checkout WITHOUT -- is correct for branches
					await git.checkout(branch);
				} else {
					throw switchError;
				}
			}
		},
		didSucceed: async () =>
			isCurrentBranch({ worktreePath, expectedBranch: branch }),
	});
}

/** Create a local branch from HEAD and switch the current worktree to it. */
export async function gitCreateAndSwitchBranch(
	worktreePath: string,
	branch: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertValidBranchName(branch);

	const git = await getGitWithShellPath(worktreePath);
	await git.raw(["switch", "-c", branch]);
}

/** Create a local branch tracking origin/<branch> and switch to it. */
export async function gitCheckoutRemoteBranch(
	worktreePath: string,
	branch: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertValidBranchName(branch);

	const git = await getGitWithShellPath(worktreePath);
	await git.raw(["switch", "--track", `origin/${branch}`]);
}

/**
 * Checkout (restore) file paths in a single git command,
 * discarding local changes.
 *
 * Uses `git checkout -- <paths...>` - the `--` is REQUIRED here
 * to indicate path mode (not branch mode). A single command avoids
 * index.lock races when discarding multiple files.
 */
export async function gitCheckoutFiles(
	worktreePath: string,
	filePaths: string[],
): Promise<void> {
	if (filePaths.length === 0) {
		throw new Error("filePaths must not be empty");
	}
	assertRegisteredWorktree(worktreePath);
	for (const filePath of filePaths) {
		assertValidGitPath(filePath);
	}

	const git = await getGitWithShellPath(worktreePath);
	await git.checkout(["--", ...filePaths]);
}

/**
 * Stage a file for commit.
 *
 * Uses `git add -- <path>` - the `--` prevents paths starting
 * with `-` from being interpreted as flags.
 */
export async function gitStageFile(
	worktreePath: string,
	filePath: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertValidGitPath(filePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.add(["--", filePath]);
}

/**
 * Stage multiple files for commit in a single git command.
 *
 * Uses `git add -- <paths...>` to avoid index.lock races
 * when staging multiple files.
 */
export async function gitStageFiles(
	worktreePath: string,
	filePaths: string[],
): Promise<void> {
	if (filePaths.length === 0) {
		throw new Error("filePaths must not be empty");
	}
	assertRegisteredWorktree(worktreePath);
	for (const filePath of filePaths) {
		assertValidGitPath(filePath);
	}

	const git = await getGitWithShellPath(worktreePath);
	await git.add(["--", ...filePaths]);
}

/**
 * Unstage multiple files in a single git command.
 *
 * Uses `git reset HEAD -- <paths...>` to avoid index.lock races
 * when unstaging multiple files.
 */
export async function gitUnstageFiles(
	worktreePath: string,
	filePaths: string[],
): Promise<void> {
	if (filePaths.length === 0) {
		throw new Error("filePaths must not be empty");
	}
	assertRegisteredWorktree(worktreePath);
	for (const filePath of filePaths) {
		assertValidGitPath(filePath);
	}

	const git = await getGitWithShellPath(worktreePath);
	await git.reset(["HEAD", "--", ...filePaths]);
}

/**
 * Stage all changes for commit.
 *
 * Uses `git add -A` to stage all changes (new, modified, deleted).
 */
export async function gitStageAll(worktreePath: string): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.add("-A");
}

/**
 * Unstage a file (remove from staging area).
 *
 * Uses `git reset HEAD -- <path>` to unstage without
 * discarding changes.
 */
export async function gitUnstageFile(
	worktreePath: string,
	filePath: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertValidGitPath(filePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.reset(["HEAD", "--", filePath]);
}

/**
 * Unstage all files.
 *
 * Uses `git reset HEAD` to unstage all changes without
 * discarding them.
 */
export async function gitUnstageAll(worktreePath: string): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.reset(["HEAD"]);
}

/**
 * Discard all unstaged changes (modified and deleted files).
 *
 * Uses `git checkout -- .` to restore all tracked files to HEAD state.
 * Does NOT affect untracked files.
 */
export async function gitDiscardAllUnstaged(
	worktreePath: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.checkout(["--", "."]);
}

/**
 * Discard all staged changes by unstaging then discarding.
 *
 * Uses `git reset HEAD` followed by `git checkout -- .`.
 * Does NOT affect untracked files.
 */
export async function gitDiscardAllStaged(worktreePath: string): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.reset(["HEAD"]);
	await git.checkout(["--", "."]);
}

/**
 * Stash all tracked changes.
 *
 * Uses `git stash push` to save current work-in-progress.
 */
export async function gitStash(worktreePath: string): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.stash(["push"]);
}

/**
 * Stash all changes including untracked files.
 *
 * Uses `git stash push --include-untracked`.
 */
export async function gitStashIncludeUntracked(
	worktreePath: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.stash(["push", "--include-untracked"]);
}

/**
 * Pop the most recent stash.
 *
 * Uses `git stash pop` to apply and remove the top stash entry.
 * Throws if no stash exists or if there are conflicts.
 */
export async function gitStashPop(worktreePath: string): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.stash(["pop"]);
}

export interface StashEntry {
	index: number;
	ref: string;
	branch: string;
	message: string;
	timestamp: number;
}

function assertStashIndex(index: number): void {
	if (!Number.isInteger(index) || index < 0) {
		throw new Error("Invalid stash index: must be a non-negative integer");
	}
}

/**
 * List all stash entries in reverse-chronological order (index 0 is newest).
 */
export async function gitStashList(
	worktreePath: string,
): Promise<StashEntry[]> {
	assertRegisteredWorktree(worktreePath);

	const git = await getGitWithShellPath(worktreePath);
	// %gd = selector like "stash@{0}", %gs = subject, %at = author timestamp
	const output = await git.raw(["stash", "list", "--format=%gd%x1f%gs%x1f%at"]);
	if (!output.trim()) return [];

	const entries: StashEntry[] = [];
	for (const line of output.split("\n")) {
		if (!line.trim()) continue;
		const [ref, subject, tsStr] = line.split("\x1f");
		if (!ref || !subject) continue;
		const match = ref.match(/^stash@\{(\d+)\}$/);
		if (!match) continue;
		const index = Number.parseInt(match[1], 10);
		// Typical subject: "WIP on <branch>: <hash> <message>" or "On <branch>: <message>"
		const branchMatch = subject.match(/^(?:WIP on|On)\s+([^:]+):/);
		const branch = branchMatch?.[1]?.trim() ?? "";
		const timestamp = Number.parseInt(tsStr ?? "", 10);
		entries.push({
			index,
			ref,
			branch,
			message: subject,
			timestamp: Number.isFinite(timestamp) ? timestamp * 1000 : 0,
		});
	}
	return entries;
}

/**
 * Apply a specific stash entry, keeping it in the stash list.
 */
export async function gitStashApplyAt(
	worktreePath: string,
	index: number,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertStashIndex(index);

	const git = await getGitWithShellPath(worktreePath);
	await git.stash(["apply", `stash@{${index}}`]);
}

/**
 * Pop a specific stash entry (apply then drop).
 */
export async function gitStashPopAt(
	worktreePath: string,
	index: number,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertStashIndex(index);

	const git = await getGitWithShellPath(worktreePath);
	await git.stash(["pop", `stash@{${index}}`]);
}

/**
 * Drop a specific stash entry without applying it.
 */
export async function gitStashDropAt(
	worktreePath: string,
	index: number,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertStashIndex(index);

	const git = await getGitWithShellPath(worktreePath);
	await git.stash(["drop", `stash@{${index}}`]);
}

/**
 * List the files touched by a stash entry.
 * Returns paths + status letter (A/M/D/R/…).
 */
export async function gitStashFileList(
	worktreePath: string,
	index: number,
): Promise<Array<{ path: string; status: string }>> {
	assertRegisteredWorktree(worktreePath);
	assertStashIndex(index);

	const git = await getGitWithShellPath(worktreePath);
	// --name-status prints "M\tpath" per file
	const output = await git.raw([
		"stash",
		"show",
		"--name-status",
		"--no-color",
		`stash@{${index}}`,
	]);
	if (!output.trim()) return [];

	const files: Array<{ path: string; status: string }> = [];
	for (const line of output.split("\n")) {
		if (!line.trim()) continue;
		const [status, ...pathParts] = line.split("\t");
		const path = pathParts.join("\t");
		if (path && status) {
			files.push({ path, status });
		}
	}
	return files;
}

/**
 * Read the before/after contents of one file inside a stash entry.
 * `before` is the file at the stash's parent commit; `after` is at the stash.
 */
export async function gitStashFileVersions(
	worktreePath: string,
	index: number,
	filePath: string,
): Promise<{ before: string; after: string }> {
	assertRegisteredWorktree(worktreePath);
	assertStashIndex(index);
	assertValidGitPath(filePath);

	const git = await getGitWithShellPath(worktreePath);
	const before = await safeShow(git, `stash@{${index}}^:${filePath}`);
	const after = await safeShow(git, `stash@{${index}}:${filePath}`);
	return { before, after };
}

async function safeShow(
	git: Awaited<ReturnType<typeof getGitWithShellPath>>,
	spec: string,
): Promise<string> {
	try {
		return await git.show([spec]);
	} catch {
		return "";
	}
}

const COMMIT_REF_PATTERN = /^[0-9a-fA-F]{4,40}(\^+|~\d+)?$/;

function assertValidCommitRef(ref: string): void {
	if (!ref || ref.startsWith("-")) {
		throw new Error("Invalid commit reference");
	}
	if (!COMMIT_REF_PATTERN.test(ref)) {
		throw new Error(
			"Invalid commit reference: must be a SHA (4-40 hex chars), optionally with ^ or ~N",
		);
	}
}

function assertValidBranchName(branch: string): void {
	if (!branch.trim()) {
		throw new Error("Invalid branch name: cannot be empty");
	}
	if (branch.startsWith("-")) {
		throw new Error("Invalid branch name: cannot start with -");
	}
}

/**
 * Delete a local branch. Uses `-D` (force) so the caller can decide
 * whether to gate on unmerged-work confirmation from the UI.
 */
export async function gitDeleteLocalBranch(
	worktreePath: string,
	branch: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertValidBranchName(branch);

	const git = await getGitWithShellPath(worktreePath);
	// Refuse deletion of the branch we're currently on.
	const current = await getCurrentBranch(worktreePath);
	if (current === branch) {
		throw new Error("Cannot delete the branch currently checked out");
	}
	await git.raw(["branch", "-D", "--", branch]);
}

/**
 * Delete a branch on a remote (defaults to `origin`) via
 * `git push <remote> --delete <branch>`.
 */
export async function gitDeleteRemoteBranch(
	worktreePath: string,
	branch: string,
	remote: string = "origin",
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertValidBranchName(branch);
	if (!remote.trim() || remote.startsWith("-")) {
		throw new Error("Invalid remote name");
	}
	if (!/^[A-Za-z0-9._/-]+$/.test(remote)) {
		throw new Error("Invalid remote name");
	}

	const git = await getGitWithShellPath(worktreePath);
	await git.raw(["push", remote, "--delete", branch]);
}

/**
 * Merge <branch> into the current branch (in-place, no checkout).
 * On conflict, throws with a message containing "CONFLICT".
 */
export async function gitMergeBranch(
	worktreePath: string,
	branch: string,
	options: { noFastForward?: boolean; squash?: boolean } = {},
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertValidBranchName(branch);

	const args = ["merge"];
	if (options.noFastForward) args.push("--no-ff");
	if (options.squash) args.push("--squash");
	args.push("--", branch);

	const git = await getGitWithShellPath(worktreePath);
	await git.raw(args);
}

/**
 * Reset the current branch to <commit> in the requested mode.
 * `hard` throws away working-tree and index changes — caller must confirm.
 */
export async function gitResetToCommit(
	worktreePath: string,
	commit: string,
	mode: "soft" | "mixed" | "hard",
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertValidCommitRef(commit);

	const git = await getGitWithShellPath(worktreePath);
	await git.raw(["reset", `--${mode}`, commit]);
}

/**
 * List commits reachable from HEAD, newest first, with optional grep/author
 * filter and offset/limit paging.
 */
export async function gitLog(
	worktreePath: string,
	options: {
		limit?: number;
		skip?: number;
		grep?: string;
		author?: string;
	} = {},
): Promise<
	Array<{
		hash: string;
		shortHash: string;
		message: string;
		author: string;
		date: number;
	}>
> {
	assertRegisteredWorktree(worktreePath);

	const limit = Math.max(1, Math.min(500, options.limit ?? 50));
	const skip = Math.max(0, options.skip ?? 0);

	const args = [
		"log",
		`--max-count=${limit}`,
		`--skip=${skip}`,
		"--no-color",
		"--format=%H%x1f%h%x1f%s%x1f%an%x1f%at",
	];
	if (options.grep) {
		args.push("--fixed-strings", `--grep=${options.grep}`);
	}
	if (options.author) {
		args.push("--fixed-strings", `--author=${options.author}`);
	}

	const git = await getGitWithShellPath(worktreePath);
	const output = await git.raw(args);
	if (!output.trim()) return [];

	const commits: Array<{
		hash: string;
		shortHash: string;
		message: string;
		author: string;
		date: number;
	}> = [];
	for (const line of output.split("\n")) {
		if (!line.trim()) continue;
		const [hash, shortHash, message, author, tsStr] = line.split("\x1f");
		if (!hash || !shortHash) continue;
		const ts = Number.parseInt(tsStr ?? "", 10);
		commits.push({
			hash,
			shortHash,
			message: message ?? "",
			author: author ?? "",
			date: Number.isFinite(ts) ? ts * 1000 : 0,
		});
	}
	return commits;
}

/**
 * Commit history for a single file (follows renames).
 */
export async function gitFileLog(
	worktreePath: string,
	filePath: string,
	options: { limit?: number } = {},
): Promise<
	Array<{
		hash: string;
		shortHash: string;
		message: string;
		author: string;
		date: number;
	}>
> {
	assertRegisteredWorktree(worktreePath);
	assertValidGitPath(filePath);

	const limit = Math.max(1, Math.min(200, options.limit ?? 100));
	const git = await getGitWithShellPath(worktreePath);
	const output = await git.raw([
		"log",
		"--follow",
		`--max-count=${limit}`,
		"--no-color",
		"--format=%H%x1f%h%x1f%s%x1f%an%x1f%at",
		"--",
		filePath,
	]);
	if (!output.trim()) return [];

	const commits: Array<{
		hash: string;
		shortHash: string;
		message: string;
		author: string;
		date: number;
	}> = [];
	for (const line of output.split("\n")) {
		if (!line.trim()) continue;
		const [hash, shortHash, message, author, tsStr] = line.split("\x1f");
		if (!hash || !shortHash) continue;
		const ts = Number.parseInt(tsStr ?? "", 10);
		commits.push({
			hash,
			shortHash,
			message: message ?? "",
			author: author ?? "",
			date: Number.isFinite(ts) ? ts * 1000 : 0,
		});
	}
	return commits;
}
