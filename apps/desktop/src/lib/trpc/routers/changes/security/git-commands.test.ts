import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Bypass the DB-backed registration check for isolated tests over real temp repos.
mock.module("./path-validation", () => ({
	assertRegisteredWorktree: () => {},
	assertValidGitPath: () => {},
	getRegisteredWorktree: () => ({}),
	resolvePathInWorktree: (worktreePath: string, filePath: string) =>
		join(worktreePath, filePath),
	validateRelativePath: () => {},
	PathValidationError: class PathValidationError extends Error {},
}));

const {
	gitCreateAndSwitchBranch,
	gitFileLog,
	gitLog,
	gitMergeBranch,
	gitResetToCommit,
	gitStashApplyAt,
	gitStashDropAt,
	gitStashFileList,
	gitStashList,
	gitStashPopAt,
} = await import("./git-commands");

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-test-git-cmds-${process.pid}`,
);

function run(cwd: string, command: string): string {
	return execSync(command, { cwd, encoding: "utf8" });
}

function seedRepo(name: string): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	run(repoPath, "git init -q -b main");
	run(repoPath, "git config user.email test@test.com");
	run(repoPath, "git config user.name Test");
	writeFileSync(join(repoPath, "a.txt"), "hello\n");
	run(repoPath, "git add .");
	run(repoPath, 'git commit -q -m "initial"');
	writeFileSync(join(repoPath, "a.txt"), "hello\nworld\n");
	run(repoPath, "git add .");
	run(repoPath, 'git commit -q -m "add world"');
	writeFileSync(join(repoPath, "b.txt"), "second file\n");
	run(repoPath, "git add .");
	run(repoPath, 'git commit -q -m "add b"');
	return repoPath;
}

beforeAll(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("gitLog", () => {
	test("returns commits in newest-first order", async () => {
		const repo = seedRepo("log-basic");
		const log = await gitLog(repo, { limit: 10 });
		expect(log.length).toBe(3);
		expect(log[0]?.message).toBe("add b");
		expect(log[1]?.message).toBe("add world");
		expect(log[2]?.message).toBe("initial");
	});

	test("filters by grep", async () => {
		const repo = seedRepo("log-grep");
		const log = await gitLog(repo, { limit: 10, grep: "world" });
		expect(log.length).toBe(1);
		expect(log[0]?.message).toBe("add world");
	});

	test("paginates via skip", async () => {
		const repo = seedRepo("log-skip");
		const log = await gitLog(repo, { limit: 10, skip: 1 });
		expect(log[0]?.message).toBe("add world");
	});
});

describe("gitFileLog", () => {
	test("returns history for a single file, following renames", async () => {
		const repo = seedRepo("file-log");
		const log = await gitFileLog(repo, "a.txt", { limit: 10 });
		expect(log.length).toBe(2);
		expect(log[0]?.message).toBe("add world");
	});
});

describe("gitStash lifecycle", () => {
	test("list, apply, drop", async () => {
		const repo = seedRepo("stash-basic");
		writeFileSync(join(repo, "a.txt"), "hello\nworld\nWIP\n");
		run(repo, "git stash push -m stash-1");

		const list = await gitStashList(repo);
		expect(list.length).toBe(1);
		expect(list[0]?.index).toBe(0);
		expect(list[0]?.message).toContain("stash-1");

		const files = await gitStashFileList(repo, 0);
		expect(files.map((f) => f.path)).toContain("a.txt");

		await gitStashApplyAt(repo, 0);
		const listAfterApply = await gitStashList(repo);
		expect(listAfterApply.length).toBe(1);

		// Clean working tree to allow next stash pop
		run(repo, "git checkout -- .");

		await gitStashDropAt(repo, 0);
		expect((await gitStashList(repo)).length).toBe(0);
	});

	test("pop applies and removes", async () => {
		const repo = seedRepo("stash-pop");
		writeFileSync(join(repo, "a.txt"), "hello\nworld\nWIP-pop\n");
		run(repo, "git stash push -m stash-pop");
		expect((await gitStashList(repo)).length).toBe(1);
		await gitStashPopAt(repo, 0);
		expect((await gitStashList(repo)).length).toBe(0);
	});

	test("rejects negative index", async () => {
		const repo = seedRepo("stash-invalid");
		await expect(gitStashDropAt(repo, -1)).rejects.toThrow();
	});
});

describe("gitResetToCommit", () => {
	test("soft reset keeps working tree", async () => {
		const repo = seedRepo("reset-soft");
		const oldHead = run(repo, "git rev-parse HEAD~1").trim();
		await gitResetToCommit(repo, oldHead, "soft");
		expect(run(repo, "git rev-parse HEAD").trim()).toBe(oldHead);
		// b.txt still there
		expect(run(repo, "git status --porcelain").trim()).not.toBe("");
	});

	test("hard reset wipes working tree", async () => {
		const repo = seedRepo("reset-hard");
		const oldHead = run(repo, "git rev-parse HEAD~2").trim();
		await gitResetToCommit(repo, oldHead, "hard");
		expect(run(repo, "git rev-parse HEAD").trim()).toBe(oldHead);
		expect(run(repo, "git status --porcelain").trim()).toBe("");
	});

	test("rejects malformed commit ref", async () => {
		const repo = seedRepo("reset-invalid");
		await expect(
			gitResetToCommit(repo, "; rm -rf /", "soft"),
		).rejects.toThrow();
	});
});

describe("branch switching", () => {
	test("creates and switches to a new branch", async () => {
		const repo = seedRepo("create-switch");
		await gitCreateAndSwitchBranch(repo, "feature/new-branch");
		expect(run(repo, "git branch --show-current").trim()).toBe(
			"feature/new-branch",
		);
	});

	test("rejects a flag-like branch name", async () => {
		const repo = seedRepo("create-switch-invalid");
		await expect(gitCreateAndSwitchBranch(repo, "--force")).rejects.toThrow();
	});
});

describe("gitMergeBranch", () => {
	test("merges a fast-forward branch", async () => {
		const repo = seedRepo("merge-ff");
		run(repo, "git checkout -q -b feature");
		writeFileSync(join(repo, "c.txt"), "feature\n");
		run(repo, "git add .");
		run(repo, "git commit -q -m feature-commit");
		run(repo, "git checkout -q main");
		await gitMergeBranch(repo, "feature");
		expect(run(repo, "git log --oneline").split("\n")[0]).toContain(
			"feature-commit",
		);
	});

	test("rejects flag-like branch names", async () => {
		const repo = seedRepo("merge-flag");
		await expect(gitMergeBranch(repo, "--force")).rejects.toThrow();
	});
});

describe("gitDeleteLocalBranch", () => {
	test("deletes a non-current local branch", async () => {
		const repo = seedRepo("delete-local");
		run(repo, "git branch feature-x");
		expect(run(repo, "git branch --list feature-x").trim()).not.toBe("");
		const { gitDeleteLocalBranch } = await import("./git-commands");
		await gitDeleteLocalBranch(repo, "feature-x");
		expect(run(repo, "git branch --list feature-x").trim()).toBe("");
	});

	test("refuses to delete the currently-checked-out branch", async () => {
		const repo = seedRepo("delete-current");
		const { gitDeleteLocalBranch } = await import("./git-commands");
		await expect(gitDeleteLocalBranch(repo, "main")).rejects.toThrow(
			/currently checked out/,
		);
	});

	test("rejects flag-like branch names", async () => {
		const repo = seedRepo("delete-flag");
		const { gitDeleteLocalBranch } = await import("./git-commands");
		await expect(gitDeleteLocalBranch(repo, "--force")).rejects.toThrow();
	});
});

describe("gitDeleteRemoteBranch", () => {
	test("rejects malformed remote names", async () => {
		const repo = seedRepo("delete-remote-invalid");
		const { gitDeleteRemoteBranch } = await import("./git-commands");
		await expect(
			gitDeleteRemoteBranch(repo, "feature", "-- --force"),
		).rejects.toThrow(/Invalid remote name/);
		await expect(gitDeleteRemoteBranch(repo, "feature", "")).rejects.toThrow(
			/Invalid remote name/,
		);
	});
});
