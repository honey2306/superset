/**
 * M2 Provisioning integration tests. Covers idempotency, begin+run+get,
 * list-by-machine, failure surfacing, and cancel semantics. Uses the real
 * host through the test harness so the `createCaller` delegation path is
 * exercised end-to-end.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { workspaceOperationSteps, workspaces } from "../../src/db/schema";
import { OperationJournal } from "../../src/workspace-provisioning";
import {
	canonicalizeProvisionRequest,
	stableJson,
} from "../../src/workspace-provisioning/canonical-request";
import { cloudFlows } from "../helpers/cloud-fakes";
import {
	createBasicScenario,
	createProjectScenario,
} from "../helpers/scenarios";

describe("workspaceProvisioning integration (M2)", () => {
	let dispose: (() => Promise<void>) | undefined;

	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
	});

	test("begin: existing project + branch source materializes and returns operation", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
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

		// The provisioning path must not fall back to the legacy mutation. This
		// adapter is deliberately made unusable for the duration of the test.
		scenario.host.setApi("v2Workspace.create.mutate", () => {
			throw new Error("legacy workspace mutation was called");
		});
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
		expect(
			scenario.host.apiCalls.some((call) =>
				call.path.includes("v2Workspace.create"),
			),
		).toBe(false);
	});

	test("idempotency: same key + same request returns the same operation", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
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
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
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
		scenario.host.setApi("v2Workspace.create.mutate", () => {
			throw new Error("legacy materializer should not be called");
		});

		const resumed =
			await scenario.host.trpc.workspaceProvisioning.begin.mutate(request);
		expect(resumed.operation.state).toBe("succeeded");
		expect(resumed.operation.workspaceId).toBe(first.operation.workspaceId);
	});

	test("idempotency: same key + different request throws IDEMPOTENCY_CONFLICT", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
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
		const scenario = await createBasicScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
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
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
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
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
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

	test("cancel after a succeeded operation returns TOO_LATE_TO_CANCEL", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
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
