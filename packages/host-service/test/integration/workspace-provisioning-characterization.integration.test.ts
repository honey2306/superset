/**
 * M0 characterization baseline for workspace / project provisioning.
 *
 * These tests pin the *currently observable* behavior of the tRPC
 * surfaces that are about to be unified by the Workspace Catalog / Provisioning
 * refactor described in
 * `plans/20260731-workspace-catalog-launch-execplan.md`. When M1 and M2
 * replace the underlying implementations, these tests must continue to
 * pass — that is the whole point of a characterization baseline: it
 * proves the visible contract at the tRPC boundary hasn't drifted while
 * we swap the guts.
 *
 * Scope of assertions:
 *   - shape of the returned tRPC value (ids, branch, flags)
 *   - shape of the persisted row in `workspaces` / `projects`
 *   - existence of the worktree on disk
 *
 * We do NOT assert on the specific implementation details (e.g. which
 * internal helper is called, which log line is emitted) because those are
 * exactly what M1/M2 are free to change.
 *
 * Each test is self-contained: its own scenario, its own repo, its own
 * dispose. Nothing is shared across tests.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { projects, workspaces } from "../../src/db/schema";
import { cloudFlows, cloudOk } from "../helpers/cloud-fakes";
import { createTestHost } from "../helpers/createTestHost";
import { createGitFixture } from "../helpers/git-fixture";
import { createProjectScenario } from "../helpers/scenarios";

/**
 * Guarantee git author identity for `initEmptyRepo` / `cloneRepoInto`
 * commits. CI runners have no global git identity; mimic
 * `project-setup.integration.test.ts`'s approach.
 */
function withGitIdentityEnv<T>(fn: () => Promise<T>): Promise<T> {
	const saved = {
		GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME,
		GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL,
		GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME,
		GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL,
	};
	process.env.GIT_AUTHOR_NAME = "Test Runner";
	process.env.GIT_AUTHOR_EMAIL = "test@superset.local";
	process.env.GIT_COMMITTER_NAME = "Test Runner";
	process.env.GIT_COMMITTER_EMAIL = "test@superset.local";
	return fn().finally(() => {
		for (const [k, v] of Object.entries(saved)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
	});
}

describe("workspace provisioning characterization (M0 baseline)", () => {
	let dispose: (() => Promise<void>) | undefined;

	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
	});

	test("workspaces.create — new branch from default lands at <baseDir>/<projectId>/<branch> and exists on disk", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "from-default",
			branch: "feature/from-default",
		});

		expect(result.workspace.branch).toBe("feature/from-default");
		expect(result.alreadyExists).toBe(false);

		const row = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		// Path scheme is `<baseDir>/<projectId>/<branch>`. Assert the
		// suffix rather than the absolute path so this isn't HOME-bound.
		expect(row?.worktreePath).toMatch(
			new RegExp(`${scenario.projectId}/feature/from-default$`),
		);
		expect(existsSync(row?.worktreePath ?? "")).toBe(true);
	});

	test("workspaces.create — explicit baseBranch is honored when creating a new branch", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		// Add a second local branch to serve as an explicit base.
		await scenario.repo.git.raw(["branch", "release/1.x"]);

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "explicit-base",
			branch: "feature/explicit-base",
			baseBranch: "release/1.x",
		});
		expect(result.workspace.branch).toBe("feature/explicit-base");

		// Base is recorded in git config so future rebases know their base
		// — the same signal `recordBaseBranch` uses in the adopt tests.
		const configured = (
			await scenario.repo.git.raw([
				"config",
				"branch.feature/explicit-base.base",
			])
		).trim();
		expect(configured).toBe("release/1.x");
	});

	test("workspaces.create — existing local branch is adopted (not recreated)", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		// Pre-create the branch (no worktree yet).
		await scenario.repo.git.raw(["branch", "preexisting"]);

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "adopt-branch",
			branch: "preexisting",
		});
		expect(result.workspace.branch).toBe("preexisting");
		// The branch itself must NOT have been renamed to a prefixed
		// version — new branches get prefixed, adopted ones don't.
		const branches = (await scenario.repo.git.raw(["branch", "--list"])).trim();
		expect(branches).toContain("preexisting");
	});

	test("workspaces.create — re-entry with the same (project, branch) returns the same workspace id (idempotency)", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const first = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "idem",
			branch: "feature/idem",
		});
		const second = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "idem",
			branch: "feature/idem",
		});

		expect(second.workspace.id).toBe(first.workspace.id);
		expect(second.alreadyExists).toBe(true);

		const rows = scenario.host.db
			.select()
			.from(workspaces)
			.where(
				and(
					eq(workspaces.projectId, scenario.projectId),
					eq(workspaces.branch, "feature/idem"),
				),
			)
			.all();
		expect(rows).toHaveLength(1);
	});

	test("workspaces.create — concurrent same-branch calls: at most one workspace row lands (loser is a CONFLICT)", async () => {
		// Current (pre-M2) behavior: the in-process lock only serializes
		// PR-based creates; two `Promise.all` calls for the same explicit
		// branch race `git worktree add` and one of them loses with
		// "cannot lock ref". M2's operation lease will turn this into an
		// idempotent single-workspace outcome — that stronger contract is
		// asserted by the M2 test suite. For the M0 baseline we only pin
		// what actually holds today: exactly one row exists after the race.
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const outcomes = await Promise.allSettled([
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				name: "race",
				branch: "feature/race",
			}),
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				name: "race",
				branch: "feature/race",
			}),
		]);
		const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
		expect(fulfilled.length).toBeGreaterThanOrEqual(1);

		const rows = scenario.host.db
			.select()
			.from(workspaces)
			.where(
				and(
					eq(workspaces.projectId, scenario.projectId),
					eq(workspaces.branch, "feature/race"),
				),
			)
			.all();
		expect(rows).toHaveLength(1);
	});

	test("workspaces.create — concurrent DIFFERENT branches both succeed without .git/config contention", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const [a, b] = await Promise.all([
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				name: "para-a",
				branch: "feature/para-a",
			}),
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				name: "para-b",
				branch: "feature/para-b",
			}),
		]);
		expect(a.workspace.id).not.toBe(b.workspace.id);
		expect(a.workspace.branch).toBe("feature/para-a");
		expect(b.workspace.branch).toBe("feature/para-b");

		const rowA = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, a.workspace.id))
			.get();
		const rowB = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, b.workspace.id))
			.get();
		expect(existsSync(rowA?.worktreePath ?? "")).toBe(true);
		expect(existsSync(rowB?.worktreePath ?? "")).toBe(true);
	});

	test("workspaces.create — explicit worktreePath reads back the branch from git and adopts", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const externalBranch = "actual-branch-on-disk";
		const externalPath = join(scenario.repo.repoPath, ".worktrees", "external");
		await scenario.repo.git.raw([
			"worktree",
			"add",
			"-b",
			externalBranch,
			externalPath,
		]);

		// The caller's `branch` here is intentionally stale — the server
		// must trust git, not the label.
		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "adopted-external",
			branch: "some-stale-label",
			worktreePath: externalPath,
		});
		expect(result.workspace.branch).toBe(externalBranch);
		const row = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		expect(row?.worktreePath).toBe(externalPath);
		expect(row?.branch).toBe(externalBranch);
	});

	test("workspaceCreation.adopt — explicit worktreePath registers the DB row", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const wt = join(scenario.repo.repoPath, ".worktrees", "adopt-me");
		await scenario.repo.git.raw([
			"worktree",
			"add",
			"-b",
			"feature/adopt-me",
			wt,
		]);
		const result = await scenario.host.trpc.workspaceCreation.adopt.mutate({
			projectId: scenario.projectId,
			workspaceName: "adopt-me",
			branch: "feature/adopt-me",
			worktreePath: wt,
		});
		expect(result.workspace.branch).toBe("feature/adopt-me");
		const row = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		expect(row?.worktreePath).toBe(wt);
	});

	test("project.create empty — one project, one main workspace at repo root, zero cloud calls", async () => {
		const host = await createTestHost();
		const parentDir = realpathSync(mkdtempSync(join(tmpdir(), "char-empty-")));
		dispose = async () => {
			await host.dispose();
			rmSync(parentDir, { recursive: true, force: true });
		};

		await withGitIdentityEnv(async () => {
			const created = await host.trpc.project.create.mutate({
				name: "Char Empty",
				mode: { kind: "empty", parentDir },
			});
			expect(created.repoPath.startsWith(parentDir)).toBe(true);
			expect(created.mainWorkspaceId).toBeTruthy();

			const ws = host.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, created.projectId))
				.all();
			expect(ws).toHaveLength(1);
			expect(ws[0]?.type).toBe("main");
			expect(ws[0]?.worktreePath).toBe(created.repoPath);
			expect(
				host.apiCalls.filter((c) => c.path.startsWith("v2Project.")),
			).toEqual([]);
		});
	});

	test("project.create clone (file:// URL) — one project, one main workspace at repo root", async () => {
		// Use another local repo as the clone source so we don't touch
		// the network. `simple-git` accepts file:// URLs against a bare
		// or non-bare repo; a non-bare seed repo with an initial commit
		// clones cleanly.
		const host = await createTestHost();
		const sourceRepo = await createGitFixture();
		// Realpath the parentDir so that macOS's /var → /private/var symlink
		// doesn't make `startsWith(parentDir)` fail once git canonicalizes.
		const parentDir = realpathSync(
			mkdtempSync(join(tmpdir(), "char-clone-parent-")),
		);
		dispose = async () => {
			await host.dispose();
			sourceRepo.dispose();
			rmSync(parentDir, { recursive: true, force: true });
		};

		await withGitIdentityEnv(async () => {
			const url = `file://${sourceRepo.repoPath}`;
			const created = await host.trpc.project.create.mutate({
				name: "Char Clone",
				mode: { kind: "clone", parentDir, url },
			});
			expect(created.repoPath.startsWith(parentDir)).toBe(true);
			expect(existsSync(join(created.repoPath, ".git"))).toBe(true);

			const ws = host.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, created.projectId))
				.all();
			expect(ws).toHaveLength(1);
			expect(ws[0]?.type).toBe("main");
			expect(ws[0]?.worktreePath).toBe(created.repoPath);
		});
	});

	test("project.create importLocal — imports an existing repo, no repo dir cleanup on failure semantics", async () => {
		const host = await createTestHost();
		const existing = await createGitFixture();
		dispose = async () => {
			await host.dispose();
			existing.dispose();
		};

		await withGitIdentityEnv(async () => {
			const created = await host.trpc.project.create.mutate({
				name: "Char Import",
				mode: { kind: "importLocal", repoPath: existing.repoPath },
			});
			expect(created.repoPath).toBe(existing.repoPath);

			const proj = host.db
				.select()
				.from(projects)
				.where(eq(projects.id, created.projectId))
				.get();
			expect(proj?.repoPath).toBe(existing.repoPath);

			const ws = host.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, created.projectId))
				.all();
			expect(ws).toHaveLength(1);
			expect(ws[0]?.type).toBe("main");
			expect(ws[0]?.worktreePath).toBe(existing.repoPath);
		});
	});

	// Template mode is skipped in M0: the tRPC schema requires an
	// http(s):// URL, and `cloneTemplateInto` shells to a real
	// `git clone` of that URL. Adding a local http fixture is out of
	// scope for a read-only baseline; M1/M2 will characterize it
	// alongside other cloud-avoiding flows.
	test.skip("project.create template — one main workspace (requires network HTTP template repo; skipped in M0)", () => {});

	test("project.setup import — sets up an already-in-cloud project id and creates a main workspace", async () => {
		const preexistingId = randomUUID();
		const host = await createTestHost({
			apiOverrides: {
				// The setup import path only consults the cloud when the local
				// row is absent AND no `origin` is passed. Return a cloud
				// project without a remote so the import path skips the
				// linkRepoCloneUrl branch.
				"v2Project.get.query": () => ({
					id: preexistingId,
					repoCloneUrl: null,
					name: "Cloud Project",
				}),
			},
		});
		const repo = await createGitFixture();
		dispose = async () => {
			await host.dispose();
			repo.dispose();
		};

		const result = await host.trpc.project.setup.mutate({
			projectId: preexistingId,
			mode: { kind: "import", repoPath: repo.repoPath },
		});
		expect(result.repoPath).toBe(repo.repoPath);
		expect(result.mainWorkspaceId).toBeTruthy();

		const proj = host.db
			.select()
			.from(projects)
			.where(eq(projects.id, preexistingId))
			.get();
		expect(proj?.repoPath).toBe(repo.repoPath);

		const ws = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.projectId, preexistingId))
			.all();
		expect(ws).toHaveLength(1);
		expect(ws[0]?.type).toBe("main");
	});

	test("workspaces.create — succeeds locally when cloud v2Workspace.create is unreachable (offline-first)", async () => {
		const scenario = await createProjectScenario({
			hostOptions: {
				apiOverrides: {
					"host.ensure.mutate": cloudOk.hostEnsure(),
					// Every cloud workspace write is rejected — the local
					// write must still land, and cloudSyncedAt must stay
					// null so the reconciler picks it up later.
					"v2Workspace.create.mutate": () => {
						throw new Error("cloud-unreachable");
					},
					"v2Workspace.getFromHost.query": () => {
						throw new Error("cloud-unreachable");
					},
				},
			},
		});
		dispose = scenario.dispose;

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "offline",
			branch: "feature/offline",
		});
		expect(result.workspace.id).toBeDefined();
		expect(result.alreadyExists).toBe(false);

		const row = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		expect(row).toBeTruthy();
		expect(row?.cloudSyncedAt).toBeNull();
		expect(existsSync(row?.worktreePath ?? "")).toBe(true);
	});
});
