import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit from "simple-git";
import { wouldMergeConflict } from "./merge-preflight";

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-merge-preflight-${process.pid}`,
);

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function seedRepo(name: string): string {
	const repo = join(TEST_DIR, name);
	mkdirSync(repo, { recursive: true });
	git(repo, "init", "-q", "-b", "main");
	git(repo, "config", "user.email", "test@example.com");
	git(repo, "config", "user.name", "Test");
	writeFileSync(join(repo, "file.txt"), "base\n");
	git(repo, "add", ".");
	git(repo, "commit", "-q", "-m", "initial");
	return repo;
}

beforeAll(() => mkdirSync(TEST_DIR, { recursive: true }));
afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe("wouldMergeConflict", () => {
	test("detects a conflict without changing repository state", async () => {
		const repo = seedRepo("conflict");
		git(repo, "switch", "-q", "-c", "feature");
		writeFileSync(join(repo, "file.txt"), "feature\n");
		git(repo, "commit", "-qam", "feature");
		git(repo, "switch", "-q", "main");
		writeFileSync(join(repo, "file.txt"), "main\n");
		git(repo, "commit", "-qam", "main");
		const headBefore = git(repo, "rev-parse", "HEAD").trim();

		expect(await wouldMergeConflict(simpleGit(repo), "feature")).toBe(true);
		expect(git(repo, "rev-parse", "HEAD").trim()).toBe(headBefore);
		expect(git(repo, "status", "--porcelain")).toBe("");
	});

	test("allows a conflict-free merge", async () => {
		const repo = seedRepo("clean");
		git(repo, "switch", "-q", "-c", "feature");
		writeFileSync(join(repo, "feature.txt"), "feature\n");
		git(repo, "add", ".");
		git(repo, "commit", "-q", "-m", "feature");
		git(repo, "switch", "-q", "main");

		expect(await wouldMergeConflict(simpleGit(repo), "feature")).toBe(false);
		expect(git(repo, "status", "--porcelain")).toBe("");
	});
});
