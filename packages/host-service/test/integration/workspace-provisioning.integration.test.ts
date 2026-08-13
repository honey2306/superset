/**
 * M2 Provisioning integration tests. Covers idempotency, begin+run+get,
 * list-by-machine, failure surfacing, and cancel semantics. Uses the real
 * host through the test harness so the `createCaller` delegation path is
 * exercised end-to-end.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { workspaceOperationSteps, workspaces } from "../../src/db/schema";
import type { WorkspaceCatalog } from "../../src/workspace-catalog";
import {
	OperationJournal,
	WorkspaceProvisioning,
} from "../../src/workspace-provisioning";
import {
	canonicalizeProvisionRequest,
	stableJson,
} from "../../src/workspace-provisioning/canonical-request";
import {
	createBasicScenario,
	createProjectScenario,
} from "../helpers/scenarios";
import { seedProject, seedWorkspace } from "../helpers/seed";

describe("workspaceProvisioning integration (M2)", () => {
	let dispose: (() => Promise<void>) | undefined;

	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
	});

	test("repairs legacy temporary project identity when reusing its main workspace", async () => {
		const scenario = await createBasicScenario();
		dispose = scenario.dispose;
		const temporaryPath = join(homedir(), "Superset", "temporary");
		const legacyProject = seedProject(scenario.host, {
			repoPath: temporaryPath,
		});
		const legacyWorkspace = seedWorkspace(scenario.host, {
			projectId: legacyProject.id,
			worktreePath: temporaryPath,
			branch: "main",
			type: "main",
		});

		const result = await scenario.host.trpc.workspaceProvisioning.begin.mutate({
			idempotencyKey: `temporary:${randomUUID()}`,
			project: { kind: "temporary", singletonKey: "default" },
			source: { kind: "main" },
		});

		expect(result.operation.projectId).toBe(legacyProject.id);
		expect(result.operation.workspaceId).toBe(legacyWorkspace.id);
		const snapshot = await scenario.host.trpc.workspaceCatalog.snapshot.query();
		const repairedProject = snapshot.projects.find(
			(project) => project.id === legacyProject.id,
		);
		expect(repairedProject?.kind).toBe("temporary");
		expect(repairedProject?.singletonKey).toBe("default");
	});

	test("begin: existing project + branch source materializes and returns operation", async () => {
		const scenario = await createProjectScenario();
		dispose = scenario.dispose;

		const result = await scenario.host.trpc.workspaceProvisioning.begin.mutate({
			idempotencyKey: `begin:${randomUUID()}`,
			project: { kind: "existing", projectId: scenario.projectId },
			source: {
				kind: "branch",
				name: { kind: "explicit", value: "feature/p1" },
				from: { kind: "default" },
			},
		});
		expect(result.operation.state).toBe("succeeded");
		expect(result.operation.workspaceId).toBeTruthy();
		expect(result.operation.projectId).toBe(scenario.projectId);

		const row = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.operation.workspaceId ?? ""))
			.get();
		expect(row?.branch).toBe("feature/p1");

		const materializerStep = scenario.host.db
			.select()
			.from(workspaceOperationSteps)
			.where(
				and(
					eq(workspaceOperationSteps.operationId, result.operation.id),
					eq(
						workspaceOperationSteps.stepKey,
						"source:existing:branch:materialize",
					),
				),
			)
			.get();
		expect(materializerStep?.status).toBe("completed");
		expect(materializerStep?.attempt).toBe(1);
	});

	test("direct Git materialization checkpoints every pre-commit boundary", async () => {
		const scenario = await createProjectScenario();
		dispose = scenario.dispose;

		const result = await scenario.host.trpc.workspaceProvisioning.begin.mutate({
			idempotencyKey: `direct-git:${randomUUID()}`,
			project: { kind: "existing", projectId: scenario.projectId },
			source: {
				kind: "branch",
				name: { kind: "explicit", value: "feature/direct-git" },
				from: { kind: "default" },
			},
		});
		expect(result.operation.state).toBe("succeeded");

		const steps = scenario.host.db
			.select()
			.from(workspaceOperationSteps)
			.where(eq(workspaceOperationSteps.operationId, result.operation.id))
			.all();
		const completedKeys = new Set(
			steps
				.filter((step) => step.status === "completed")
				.map((step) => step.stepKey),
		);
		for (const key of [
			"source:existing:branch:ensure-main",
			"source:existing:branch:prune",
			"source:existing:branch:resolve",
			"source:existing:branch:worktree-add",
			"source:existing:branch:configure",
			"source:existing:branch:materialize",
		]) {
			expect(completedKeys.has(key)).toBe(true);
		}
		expect(
			steps.find((step) => step.stepKey.endsWith(":worktree-add"))?.outputJson,
		).toContain("feature/direct-git");
	});

	test("idempotency: same key + same request returns the same operation", async () => {
		const scenario = await createProjectScenario();
		dispose = scenario.dispose;

		const request = {
			idempotencyKey: `idem:${randomUUID()}`,
			project: { kind: "existing" as const, projectId: scenario.projectId },
			source: {
				kind: "branch" as const,
				name: { kind: "explicit" as const, value: "feature/idem" },
				from: { kind: "default" as const },
			},
		};

		const first =
			await scenario.host.trpc.workspaceProvisioning.begin.mutate(request);
		const second =
			await scenario.host.trpc.workspaceProvisioning.begin.mutate(request);
		expect(second.operation.id).toBe(first.operation.id);
		expect(second.operation.workspaceId).toBe(first.operation.workspaceId);
	});

	test("resume reuses a completed materializer receipt before calling legacy Git", async () => {
		const scenario = await createProjectScenario();
		dispose = scenario.dispose;

		const source = {
			project: { kind: "existing" as const, projectId: scenario.projectId },
			source: {
				kind: "branch" as const,
				name: { kind: "explicit" as const, value: "feature/substep" },
				from: { kind: "default" as const },
			},
		};
		const first = await scenario.host.trpc.workspaceProvisioning.begin.mutate({
			idempotencyKey: `substep-source:${randomUUID()}`,
			...source,
		});
		const materializerStep = scenario.host.db
			.select()
			.from(workspaceOperationSteps)
			.where(
				and(
					eq(workspaceOperationSteps.operationId, first.operation.id),
					eq(
						workspaceOperationSteps.stepKey,
						"source:existing:branch:materialize",
					),
				),
			)
			.get();
		expect(materializerStep?.outputJson).toBeTruthy();

		const request = {
			idempotencyKey: `substep-resume:${randomUUID()}`,
			...source,
		};
		const canonical = canonicalizeProvisionRequest(request);
		const journal = new OperationJournal(scenario.host.db);
		const operationId = journal.create({
			idempotencyKey: request.idempotencyKey,
			requestHash: canonical.hash,
			requestJson: stableJson(canonical.redacted),
			launchPayloadJson: stableJson({ initialSessions: [] }),
		});
		const stepKey = "source:existing:branch:materialize";
		journal.markStepStarted(operationId, stepKey, {
			projectKind: "existing",
			sourceKind: "branch",
		});
		journal.markStepComplete(
			operationId,
			stepKey,
			JSON.parse(materializerStep?.outputJson ?? "{}") as Record<
				string,
				unknown
			>,
		);

		const resumed =
			await scenario.host.trpc.workspaceProvisioning.begin.mutate(request);
		expect(resumed.operation.state).toBe("succeeded");
		expect(resumed.operation.workspaceId).toBe(first.operation.workspaceId);
	});

	test("idempotency: same key + different request throws IDEMPOTENCY_CONFLICT", async () => {
		const scenario = await createProjectScenario();
		dispose = scenario.dispose;

		const key = `conflict:${randomUUID()}`;
		await scenario.host.trpc.workspaceProvisioning.begin.mutate({
			idempotencyKey: key,
			project: { kind: "existing", projectId: scenario.projectId },
			source: {
				kind: "branch",
				name: { kind: "explicit", value: "feature/a" },
				from: { kind: "default" },
			},
		});

		await expect(
			scenario.host.trpc.workspaceProvisioning.begin.mutate({
				idempotencyKey: key,
				project: { kind: "existing", projectId: scenario.projectId },
				source: {
					kind: "branch",
					name: { kind: "explicit", value: "feature/b" },
					from: { kind: "default" },
				},
			}),
		).rejects.toMatchObject({ data: { code: "CONFLICT" } });
	});

	test("resume reuses a completed source receipt before advancing the operation", async () => {
		const scenario = await createBasicScenario();
		dispose = scenario.dispose;

		const request = {
			idempotencyKey: `source-receipt:${randomUUID()}`,
			project: { kind: "existing" as const, projectId: scenario.projectId },
			source: { kind: "main" as const },
		};
		const canonical = canonicalizeProvisionRequest(request);
		const journal = new OperationJournal(scenario.host.db);
		const operationId = journal.create({
			idempotencyKey: request.idempotencyKey,
			requestHash: canonical.hash,
			requestJson: stableJson(canonical.redacted),
			launchPayloadJson: stableJson({ initialSessions: [] }),
		});
		const stepKey = "source:existing:main";
		journal.markStepStarted(operationId, stepKey, {
			projectKind: "existing",
			sourceKind: "main",
		});
		journal.markStepComplete(operationId, stepKey, {
			projectId: scenario.projectId,
			workspaceId: scenario.workspaceId,
			disposition: "reused",
			launches: [],
			warnings: [],
		});

		const result =
			await scenario.host.trpc.workspaceProvisioning.begin.mutate(request);
		expect(result.operation.state).toBe("succeeded");
		expect(result.operation.workspaceId).toBe(scenario.workspaceId);

		const step = scenario.host.db
			.select()
			.from(workspaceOperationSteps)
			.where(
				and(
					eq(workspaceOperationSteps.operationId, operationId),
					eq(workspaceOperationSteps.stepKey, stepKey),
				),
			)
			.get();
		expect(step?.status).toBe("completed");
		expect(step?.attempt).toBe(1);
	});

	test("get: returns the persisted operation", async () => {
		const scenario = await createProjectScenario();
		dispose = scenario.dispose;

		const begin = await scenario.host.trpc.workspaceProvisioning.begin.mutate({
			idempotencyKey: `get:${randomUUID()}`,
			project: { kind: "existing", projectId: scenario.projectId },
			source: {
				kind: "branch",
				name: { kind: "explicit", value: "feature/for-get" },
				from: { kind: "default" },
			},
		});
		const fetched = await scenario.host.trpc.workspaceProvisioning.get.query({
			operationId: begin.operation.id,
		});
		expect(fetched?.id).toBe(begin.operation.id);
		expect(fetched?.state).toBe("succeeded");
	});

	test("list rejects without machine-id header (test harness omits it)", async () => {
		const scenario = await createProjectScenario();
		dispose = scenario.dispose;

		// createTestHost does not set the machine-id header; list must reject.
		await expect(
			scenario.host.trpc.workspaceProvisioning.list.query({}),
		).rejects.toMatchObject({
			data: { code: "PRECONDITION_FAILED" },
		});
	});

	test("failure surfaces as failed state with an error code, no crash", async () => {
		const scenario = await createProjectScenario();
		dispose = scenario.dispose;

		// Non-existent project id triggers PROJECT_NOT_SETUP inside
		// workspaces.create → runner throws → provisioning journals failed.
		const result = await scenario.host.trpc.workspaceProvisioning.begin.mutate({
			idempotencyKey: `fail:${randomUUID()}`,
			project: { kind: "existing", projectId: randomUUID() },
			source: {
				kind: "branch",
				name: { kind: "explicit", value: "feature/x" },
				from: { kind: "default" },
			},
		});
		expect(result.operation.state).toBe("failed");
		expect(result.operation.failure?.code).toBeTruthy();
	});

	test("queued operations cancel before execution and cannot be retried", async () => {
		const scenario = await createBasicScenario();
		dispose = scenario.dispose;
		const request = {
			idempotencyKey: `queued-cancel:${randomUUID()}`,
			project: { kind: "existing" as const, projectId: scenario.projectId },
			source: { kind: "main" as const },
		};
		const canonical = canonicalizeProvisionRequest(request);
		const provisioning = new WorkspaceProvisioning({
			db: scenario.host.db,
			catalog: {} as WorkspaceCatalog,
			eventBus: null,
			runner: async () => {
				throw new Error("cancelled queued operation must not run");
			},
		});
		const operationId = provisioning.journal.create({
			idempotencyKey: request.idempotencyKey,
			requestHash: canonical.hash,
			requestJson: stableJson(canonical.redacted),
			launchPayloadJson: stableJson({ initialSessions: [] }),
		});

		expect(provisioning.act({ operationId, action: "cancel" }).state).toBe(
			"cancelled",
		);
		expect(provisioning.act({ operationId, action: "retry" }).state).toBe(
			"cancelled",
		);
		expect(
			(await provisioning.resume(operationId, request)).operation.state,
		).toBe("cancelled");
	});

	test("cancel wins a pre-commit race against runner success", async () => {
		const scenario = await createBasicScenario();
		dispose = scenario.dispose;
		let releaseRunner: (() => void) | undefined;
		const runnerGate = new Promise<void>((resolve) => {
			releaseRunner = resolve;
		});
		const provisioning = new WorkspaceProvisioning({
			db: scenario.host.db,
			catalog: {} as WorkspaceCatalog,
			eventBus: null,
			runner: async ({ throwIfCancellationRequested }) => {
				await runnerGate;
				throwIfCancellationRequested();
				return {
					projectId: scenario.projectId,
					workspaceId: scenario.workspaceId,
					disposition: "reused",
					launches: [],
					warnings: [],
				};
			},
		});
		const request = {
			idempotencyKey: `cancel-race:${randomUUID()}`,
			project: { kind: "existing" as const, projectId: scenario.projectId },
			source: { kind: "main" as const },
		};
		const pending = provisioning.begin(request);
		await Bun.sleep(5);
		const row = provisioning.journal.findByIdempotencyKey(
			request.idempotencyKey,
		);
		expect(row?.state).toBe("running");
		const requested = provisioning.act({
			operationId: row?.id ?? "",
			action: "cancel",
		});
		// Cancellation is observable as a request while the runner is still
		// active; it is not terminal until the runner stops and compensates.
		expect(requested.state).toBe("running");
		expect(requested.completedAt).toBeUndefined();
		expect(requested.cancelRequestedAt).toBeNumber();
		releaseRunner?.();
		const cancelled = (await pending).operation;
		expect(cancelled.state).toBe("cancelled");
		expect(cancelled.completedAt).toBeNumber();
		expect(cancelled.failure).toBeUndefined();
	});

	test("cataloging alone does not reject cancellation", async () => {
		const scenario = await createBasicScenario();
		dispose = scenario.dispose;
		let releaseRunner: (() => void) | undefined;
		const runnerGate = new Promise<void>((resolve) => {
			releaseRunner = resolve;
		});
		const provisioning = new WorkspaceProvisioning({
			db: scenario.host.db,
			catalog: {} as WorkspaceCatalog,
			eventBus: null,
			runner: async ({ beginCatalogCommit, throwIfCancellationRequested }) => {
				beginCatalogCommit();
				await runnerGate;
				throwIfCancellationRequested();
				throw new Error("unreachable");
			},
		});
		const request = {
			idempotencyKey: `cataloging-cancel:${randomUUID()}`,
			project: { kind: "existing" as const, projectId: scenario.projectId },
			source: { kind: "main" as const },
		};
		const pending = provisioning.begin(request);
		await Bun.sleep(5);
		const row = provisioning.journal.findByIdempotencyKey(
			request.idempotencyKey,
		);
		expect(row?.stage).toBe("cataloging");
		const requested = provisioning.act({
			operationId: row?.id ?? "",
			action: "cancel",
		});
		expect(requested.state).toBe("running");
		expect(requested.stage).toBe("cataloging");
		releaseRunner?.();
		expect((await pending).operation.state).toBe("cancelled");
	});

	test("failed compensation does not masquerade as cancelled", async () => {
		const scenario = await createBasicScenario();
		dispose = scenario.dispose;
		let releaseRunner: (() => void) | undefined;
		const runnerGate = new Promise<void>((resolve) => {
			releaseRunner = resolve;
		});
		const provisioning = new WorkspaceProvisioning({
			db: scenario.host.db,
			catalog: {} as WorkspaceCatalog,
			eventBus: null,
			runner: async ({
				journal,
				operationId,
				throwIfCancellationRequested,
			}) => {
				journal.recordArtifacts(operationId, [
					{
						kind: "worktree",
						identity: "/owned/worktree",
						ownership: "created",
					},
				]);
				await runnerGate;
				throwIfCancellationRequested();
				throw new Error("unreachable");
			},
		});
		const request = {
			idempotencyKey: `cancel-incomplete:${randomUUID()}`,
			project: { kind: "existing" as const, projectId: scenario.projectId },
			source: { kind: "main" as const },
		};
		const pending = provisioning.begin(request);
		await Bun.sleep(5);
		const row = provisioning.journal.findByIdempotencyKey(
			request.idempotencyKey,
		);
		provisioning.act({ operationId: row?.id ?? "", action: "cancel" });
		releaseRunner?.();
		const failed = (await pending).operation;
		expect(failed.state).toBe("failed");
		expect(failed.failure?.code).toBe("COMPENSATION_INCOMPLETE");
		expect(failed.failure?.cleanup).toBe("incomplete");
	});

	test("post-Catalog commit cancellation is typed TOO_LATE while running or failed", async () => {
		const scenario = await createBasicScenario();
		dispose = scenario.dispose;
		let releaseRunner: (() => void) | undefined;
		const runnerGate = new Promise<void>((resolve) => {
			releaseRunner = resolve;
		});
		const provisioning = new WorkspaceProvisioning({
			db: scenario.host.db,
			catalog: {} as WorkspaceCatalog,
			eventBus: null,
			runner: async ({ beginCatalogCommit, markCatalogCommitted }) => {
				beginCatalogCommit();
				markCatalogCommitted({
					projectId: scenario.projectId,
					workspaceId: scenario.workspaceId,
				});
				await runnerGate;
				throw new Error("post-commit runtime failure");
			},
		});
		const request = {
			idempotencyKey: `postcommit-cancel:${randomUUID()}`,
			project: { kind: "existing" as const, projectId: scenario.projectId },
			source: { kind: "main" as const },
		};
		const pending = provisioning.begin(request);
		await Bun.sleep(5);
		const row = provisioning.journal.findByIdempotencyKey(
			request.idempotencyKey,
		);
		expect(() =>
			provisioning.act({ operationId: row?.id ?? "", action: "cancel" }),
		).toThrow("TOO_LATE_TO_CANCEL");
		releaseRunner?.();
		const failed = (await pending).operation;
		expect(failed.state).toBe("failed");
		expect(() =>
			provisioning.act({ operationId: failed.id, action: "cancel" }),
		).toThrow("TOO_LATE_TO_CANCEL");
	});

	test("cancel after a succeeded operation returns TOO_LATE_TO_CANCEL", async () => {
		const scenario = await createProjectScenario();
		dispose = scenario.dispose;

		const begin = await scenario.host.trpc.workspaceProvisioning.begin.mutate({
			idempotencyKey: `cancel:${randomUUID()}`,
			project: { kind: "existing", projectId: scenario.projectId },
			source: {
				kind: "branch",
				name: { kind: "explicit", value: "feature/cancel" },
				from: { kind: "default" },
			},
		});
		await expect(
			scenario.host.trpc.workspaceProvisioning.act.mutate({
				operationId: begin.operation.id,
				action: "cancel",
			}),
		).rejects.toThrow(/TOO_LATE_TO_CANCEL/);
	});
});
