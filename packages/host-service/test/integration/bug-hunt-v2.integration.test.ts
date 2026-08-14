/**
 * v2-specific bug hunt. v1 (workspace.*) is sunset; ignore those surfaces.
 * Pass = defense holds. Fail / .todo = real v2 bug.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("bug-hunt-v2: progress-store leak on early errors in workspaceCreation.create", () => {
	// Both `workspaceCreation.create` and `workspaceCreation.getProgress`
	// were removed by PR #3893 (canonical workspaces.create) — the entire
	// progress store is gone. The leak these tests guarded is no longer
	// reachable. Re-author against `workspaces.create` if/when an
	// equivalent surface exists.
	test.todo(
		"PROJECT_NOT_SETUP error in create() does not leak a stale progress entry",
	);
	test.todo(
		"whitespace-only branchName error in create() does not leak progress",
	);
});

describe("bug-hunt-v2: workspaceCleanup.destroy phase ordering", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();

	beforeEach(async () => {
		repo = await createGitFixture();
	});

	afterEach(async () => {
		if (host) await host.dispose();
		repo.dispose();
	});

	test("destroy rejects a main workspace before running teardown", async () => {
		// We can't exercise the actual `teardown.sh` script in bun:test
		// (the harness has no PTY). Verify the phase-0 main-workspace guard
		// fires before teardown. Real TEARDOWN_FAILED behavior needs a
		// PTY-enabled harness to cover.
		const workspaceId = randomUUID();
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
				worktreePath: repo.repoPath,
				branch: "main",
			})
			.run();

		await expect(
			host.trpc.workspaceCleanup.destroy.mutate({ workspaceId }),
		).rejects.toThrow(/Main workspaces cannot be deleted/i);
	});
});
