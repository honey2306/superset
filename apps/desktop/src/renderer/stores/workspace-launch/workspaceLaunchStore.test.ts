import { beforeEach, describe, expect, test } from "bun:test";
import {
	createInMemoryProvisioningAdapter,
	type WorkspaceOperation,
} from "@superset/workspace-client";
import {
	selectOperationsByState,
	selectPendingOperation,
	useWorkspaceLaunchStore,
} from "./workspaceLaunchStore";

const request = {
	idempotencyKey: "launch-1",
	project: { kind: "existing" as const, projectId: "p" },
	source: { kind: "main" as const },
};

describe("useWorkspaceLaunchStore", () => {
	beforeEach(() => {
		useWorkspaceLaunchStore.getState().clear();
	});

	test("begin caches by idempotency key so a re-click reuses the running operation", async () => {
		const adapter = createInMemoryProvisioningAdapter();
		const first = await useWorkspaceLaunchStore
			.getState()
			.begin({ adapter, request });
		const second = await useWorkspaceLaunchStore
			.getState()
			.begin({ adapter, request });
		expect(second.id).toBe(first.id);
	});

	test("subscribe fans broadcasts into the projection", async () => {
		const adapter = createInMemoryProvisioningAdapter();
		const off = useWorkspaceLaunchStore.getState().subscribe(adapter);
		const seed: WorkspaceOperation = {
			id: "broadcast-1",
			revision: 1,
			state: "running",
			launches: [],
			warnings: [],
			createdAt: 0,
			updatedAt: 0,
		};
		adapter.broadcast(seed);
		expect(useWorkspaceLaunchStore.getState().operations[seed.id]).toEqual(
			seed,
		);
		off();
	});

	test("reconcile hydrates from adapter.list", async () => {
		const adapter = createInMemoryProvisioningAdapter();
		adapter.seedOperation({
			id: "hydrated",
			revision: 1,
			state: "succeeded",
			launches: [],
			warnings: [],
			createdAt: 0,
			updatedAt: 0,
		});
		await useWorkspaceLaunchStore.getState().reconcile(adapter);
		expect(useWorkspaceLaunchStore.getState().operations.hydrated).toBeTruthy();
	});

	test("cancel transitions state to cancelled and updates projection", async () => {
		const adapter = createInMemoryProvisioningAdapter();
		const op = await useWorkspaceLaunchStore
			.getState()
			.begin({ adapter, request });
		const cancelled = await useWorkspaceLaunchStore
			.getState()
			.cancel(adapter, op.id);
		expect(cancelled.state).toBe("cancelled");
	});

	test("selectors compute derived views correctly", async () => {
		const adapter = createInMemoryProvisioningAdapter();
		const op = await useWorkspaceLaunchStore
			.getState()
			.begin({ adapter, request });
		const succeeded = selectOperationsByState(
			useWorkspaceLaunchStore.getState(),
			"succeeded",
		);
		expect(succeeded.map((o) => o.id)).toContain(op.id);
		const pending = selectPendingOperation(
			useWorkspaceLaunchStore.getState(),
			request.idempotencyKey,
		);
		expect(pending?.id).toBe(op.id);
	});
});
