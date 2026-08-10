import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { getGitStatusSnapshot } from "./git-status";

describe("getGitStatusSnapshot untracked cache contract", () => {
	let repo: string;
	let git: SimpleGit;
	let invocations: string[][];

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-git-status-"));
		git = simpleGit(repo);
		await git.init();
		await git.raw(["config", "user.email", "test@example.com"]);
		await git.raw(["config", "user.name", "test"]);
		await writeFile(join(repo, "README.md"), "hello\n");
		await git.raw(["add", "README.md"]);
		await git.raw(["commit", "-m", "initial"]);
		invocations = [];
		git.outputHandler((_command, _stdout, _stderr, args) => {
			invocations.push(args);
		});
	});

	afterEach(() => rmSync(repo, { recursive: true, force: true }));

	test("uses normal untracked mode so git can retain core.untrackedCache", async () => {
		await getGitStatusSnapshot({ git, worktreePath: repo });
		const status = invocations.find((args) => args[0] === "status") ?? [];
		expect(status).toContain("--untracked-files=normal");
	});

	test("expands a collapsed untracked directory back to individual files", async () => {
		await mkdir(join(repo, "newdir", "nested"), { recursive: true });
		await writeFile(join(repo, "newdir", "a.txt"), "a\n");
		await writeFile(join(repo, "newdir", "nested", "b.txt"), "b\n");

		const { snapshot } = await getGitStatusSnapshot({
			git,
			worktreePath: repo,
		});
		expect(
			snapshot.unstaged
				.filter((file) => file.status === "untracked")
				.map((file) => file.path)
				.sort(),
		).toEqual(["newdir/a.txt", "newdir/nested/b.txt"]);
	});
});
