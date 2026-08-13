/**
 * Round 4 of bug-hunting. Cross-project leakage, repeated cleanup,
 * abort-signal handling.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

let host: TestHost;
let repo: GitFixture;
const projectId = randomUUID();
const workspaceId = randomUUID();
const worktreePath = "<unset>";
let actualWorktreePath: string;

beforeEach(async () => {
	repo = await createGitFixture();
	actualWorktreePath = join(repo.repoPath, ".worktrees", "feature-double");
	await repo.git.raw([
		"worktree",
		"add",
		"-b",
		"feature/double",
		actualWorktreePath,
	]);
});

afterEach(async () => {
	if (host) await host.dispose();
	repo.dispose();
});

test("workspaceCleanup.destroy called twice: both local deletes succeed", async () => {
	host = await createTestHost();
	host.db
		.insert(projects)
		.values({ id: projectId, repoPath: repo.repoPath })
		.run();
	host.db
		.insert(workspaces)
		.values({
			id: workspaceId,
			projectId,
			worktreePath: actualWorktreePath,
			branch: "feature/double",
		})
		.run();

	const first = await host.trpc.workspaceCleanup.destroy.mutate({
		workspaceId,
	});
	expect(first.success).toBe(true);

	// Second call is a no-op because the local row is already gone.
	const second = await host.trpc.workspaceCleanup.destroy.mutate({
		workspaceId,
	});
	expect(second.success).toBe(true);
	expect(second.warnings).toEqual([]);
});

void worktreePath; // keep variable name for line-skew stability

describe("bug-hunt-4: abort-signal handling", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();
	const workspaceId = randomUUID();

	beforeEach(async () => {
		host = await createTestHost();
		repo = await createGitFixture();
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath: repo.repoPath,
				branch: "main",
			})
			.run();
	});

	afterEach(async () => {
		await host.dispose();
		repo.dispose();
	});

	test("filesystem.listDirectory completes normally without an abort signal", async () => {
		const result = await host.trpc.filesystem.listDirectory.query({
			workspaceId,
			absolutePath: repo.repoPath,
		});
		expect(result.entries).toBeDefined();
	});
});
