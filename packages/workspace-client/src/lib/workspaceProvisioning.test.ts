import { describe, expect, test } from "bun:test";
import {
	createInMemoryProvisioningAdapter,
	extractAttachableLaunches,
	type WorkspaceOperation,
} from "./workspaceProvisioning";

const baseOp = (id: string): WorkspaceOperation => ({
	id,
	revision: 1,
	state: "succeeded",
	launches: [],
	warnings: [],
	workspaceId: `${id}-ws`,
	projectId: `${id}-project`,
	disposition: "created",
	createdAt: 1,
	updatedAt: 1,
	completedAt: 1,
});

describe("createInMemoryProvisioningAdapter", () => {
	test("begin returns the same operation for the same idempotency key", async () => {
		const a = createInMemoryProvisioningAdapter();
		const key = "same-key";
		const request = {
			idempotencyKey: key,
			project: { kind: "existing" as const, projectId: "p" },
			source: { kind: "main" as const },
		};
		const first = await a.begin(request);
		const second = await a.begin(request);
		expect(second.operationId).toBe(first.operationId);
	});

	test("enqueueOutcome scripts the next begin's result", async () => {
		const a = createInMemoryProvisioningAdapter();
		const scripted = baseOp("scripted");
		a.enqueueOutcome(() => scripted);
		const { operation } = await a.begin({
			idempotencyKey: "k1",
			project: { kind: "existing", projectId: "p" },
			source: { kind: "main" },
		});
		expect(operation.id).toBe("scripted");
	});

	test("get returns null for unknown ids", async () => {
		const a = createInMemoryProvisioningAdapter();
		expect(await a.get("nope")).toBeNull();
	});

	test("subscribe fires on every put", async () => {
		const a = createInMemoryProvisioningAdapter();
		const received: WorkspaceOperation[] = [];
		const off = a.subscribe((op) => received.push(op));
		await a.begin({
			idempotencyKey: "k2",
			project: { kind: "existing", projectId: "p" },
			source: { kind: "main" },
		});
		expect(received).toHaveLength(1);
		off();
		await a.begin({
			idempotencyKey: "k3",
			project: { kind: "existing", projectId: "p" },
			source: { kind: "main" },
		});
		expect(received).toHaveLength(1);
	});

	test("act cancel transitions succeeded → cancelled and bumps revision", async () => {
		const a = createInMemoryProvisioningAdapter();
		const { operation } = await a.begin({
			idempotencyKey: "k4",
			project: { kind: "existing", projectId: "p" },
			source: { kind: "main" },
		});
		const cancelled = await a.act({
			operationId: operation.id,
			action: "cancel",
		});
		expect(cancelled.state).toBe("cancelled");
		expect(cancelled.revision).toBe(operation.revision + 1);
	});

	test("list can filter by state", async () => {
		const a = createInMemoryProvisioningAdapter();
		a.seedOperation({ ...baseOp("s"), state: "succeeded" });
		a.seedOperation({ ...baseOp("f"), state: "failed", failure: undefined });
		const failed = await a.list({ states: ["failed"] });
		expect(failed.map((r) => r.id)).toEqual(["f"]);
	});
});

describe("extractAttachableLaunches", () => {
	test("keeps only terminal launches marked attachable", () => {
		const kept = extractAttachableLaunches([
			{
				key: "a",
				kind: "terminal",
				sessionId: "s1",
				role: "shell",
				attachable: true,
			},
			{ key: "b", kind: "chat", sessionId: "s2" },
		]);
		expect(kept).toHaveLength(1);
		expect(kept[0]?.key).toBe("a");
	});
});
