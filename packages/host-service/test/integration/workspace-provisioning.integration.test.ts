/**
 * M2 Provisioning integration tests. Covers idempotency, begin+run+get,
 * list-by-machine, failure surfacing, and cancel semantics. Uses the real
 * host through the test harness so the `createCaller` delegation path is
 * exercised end-to-end.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createProjectScenario } from "../helpers/scenarios";

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
