/**
 * M2 recovery + resource-busy integration tests. Uses the real bun:sqlite
 * fixture; the second host in each restart scenario reboots against the
 * same dbPath so `runProvisioningResumeSweep` (M2 boot-time sweep) runs
 * against the previous host's uncompleted rows.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { workspaceOperations } from "../../src/db/schema";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture } from "../helpers/git-fixture";
import { seedProject, seedWorkspace } from "../helpers/seed";

describe("workspaceProvisioning recovery + leases (M2)", () => {
	let cleanup: Array<() => Promise<void>> = [];

	afterEach(async () => {
		for (const fn of cleanup) {
			try {
				await fn();
			} catch {
				// best-effort
			}
		}
		cleanup = [];
	});

	function makeDbPath(): string {
		return join(mkdtempSync(join(tmpdir(), "wp-restart-")), "host.db");
	}

	test("host restart marks orphan running/queued operations as failed(retryable=true)", async () => {
		const dbPath = makeDbPath();

		// First host: seed a project + workspace so the operation could
		// have been in-flight against a real target, then hand-insert an
		// orphan operation row directly (bypassing begin) — as if the
		// process crashed after `patch(state='running')` but before the
		// runner finished.
		const first = await createTestHost({ dbPath, removeDbOnDispose: false });
		cleanup.push(async () => first.dispose());
		const repo = await createGitFixture();
		cleanup.push(async () => repo.dispose());
		const { id: projectId } = seedProject(first, { repoPath: repo.repoPath });
		seedWorkspace(first, {
			projectId,
			worktreePath: repo.repoPath,
			branch: "main",
			type: "main",
		});
		const orphanId = randomUUID();
		const now = Date.now();
		first.db
			.insert(workspaceOperations)
			.values({
				id: orphanId,
				idempotencyKey: `orphan:${orphanId}`,
				requestHash: "hash",
				requestJson: "{}",
				launchPayloadJson: "{}",
				requestedByMachineId: null,
				state: "running",
				stage: "materializing",
				revision: 5,
				plannedProjectId: projectId,
				plannedWorkspaceId: randomUUID(),
				createdAt: now,
				updatedAt: now,
			})
			.run();
		await first.stop();

		// Second host: same file, resume sweep should run at boot.
		const second = await createTestHost({
			dbPath,
			removeDbOnDispose: true,
		});
		cleanup.push(async () => second.dispose());

		const row = second.db
			.select()
			.from(workspaceOperations)
			.where(eq(workspaceOperations.id, orphanId))
			.get();
		expect(row?.state).toBe("failed");
		expect(row?.failureRetryable).toBe(1);
		expect(row?.failureCode).toBe("COMPENSATION_INCOMPLETE");
		expect(row?.launchPayloadJson).toBeNull();
	});

	test("two operations against the same natural identity lock return RESOURCE_BUSY on the second (locks stay claimed while first runs)", async () => {
		// We can't easily race two real `begin` calls that both stall
		// mid-runner, so simulate the pre-condition directly: manually
		// insert a lock row for the target identity and confirm the
		// runner surfaces RESOURCE_BUSY as a failed(retryable) operation.
		const host = await createTestHost({
			apiOverrides: cloudFlows.workspaceCreateOk(),
		});
		cleanup.push(async () => host.dispose());
		const repo = await createGitFixture();
		cleanup.push(async () => repo.dispose());
		const { id: projectId } = seedProject(host, { repoPath: repo.repoPath });
		seedWorkspace(host, {
			projectId,
			worktreePath: repo.repoPath,
			branch: "main",
			type: "main",
		});

		// Pre-claim the branch identity.
		const fakeOwnerOpId = randomUUID();
		const now = Date.now();
		host.db
			.insert(workspaceOperations)
			.values({
				id: fakeOwnerOpId,
				idempotencyKey: `owner:${fakeOwnerOpId}`,
				requestHash: "hash",
				requestJson: "{}",
				launchPayloadJson: null,
				requestedByMachineId: null,
				state: "running",
				stage: "materializing",
				revision: 1,
				createdAt: now,
				updatedAt: now,
			})
			.run();
		// Direct SQL because the lock table type is internal to the module.
		const { workspaceOperationLocks } = await import(
			"../../src/db/schema"
		);
		host.db
			.insert(workspaceOperationLocks)
			.values({
				lockKey: `project:${projectId}:branch:feature/busy`,
				operationId: fakeOwnerOpId,
				leaseOwner: "fake-owner",
				leaseExpiresAt: now + 60_000,
			})
			.run();

		const outcome =
			await host.trpc.workspaceProvisioning.begin.mutate({
				idempotencyKey: `busy:${randomUUID()}`,
				project: { kind: "existing", projectId },
				source: {
					kind: "branch",
					name: { kind: "explicit", value: "feature/busy" },
					from: { kind: "default" },
				},
			});
		expect(outcome.operation.state).toBe("failed");
		expect(outcome.operation.failure?.code).toBe("RESOURCE_BUSY");
		expect(outcome.operation.failure?.retryable).toBe(true);
	});

	test("successful operation releases its identity leases on completion", async () => {
		const host = await createTestHost({
			apiOverrides: cloudFlows.workspaceCreateOk(),
		});
		cleanup.push(async () => host.dispose());
		const repo = await createGitFixture();
		cleanup.push(async () => repo.dispose());
		const { id: projectId } = seedProject(host, { repoPath: repo.repoPath });
		seedWorkspace(host, {
			projectId,
			worktreePath: repo.repoPath,
			branch: "main",
			type: "main",
		});

		await host.trpc.workspaceProvisioning.begin.mutate({
			idempotencyKey: `release:${randomUUID()}`,
			project: { kind: "existing", projectId },
			source: {
				kind: "branch",
				name: { kind: "explicit", value: "feature/release" },
				from: { kind: "default" },
			},
		});
		const { workspaceOperationLocks } = await import(
			"../../src/db/schema"
		);
		const rows = host.db.select().from(workspaceOperationLocks).all();
		expect(rows).toHaveLength(0);
	});
});
