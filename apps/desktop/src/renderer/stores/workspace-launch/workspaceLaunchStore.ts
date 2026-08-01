/**
 * Workspace Launch Coordinator store (M3). Owns pending → committed →
 * succeeded / failed projections for durable Workspace Provisioning
 * operations. Sits on top of a `ProvisioningAdapter`; production wires the
 * tRPC Adapter, tests inject the in-memory one.
 *
 * This store deliberately does not replace `useWorkspaceCreates` at M3 —
 * that swap lands in M4 once all four callers migrate. What M3 delivers
 * is the machinery: a single Interface every caller can migrate to, with
 * reconciliation on reconnect and idempotent re-invocation.
 */
import type {
	ProvisioningAdapter,
	ProvisionWorkspaceRequest,
	WorkspaceOperation,
} from "@superset/workspace-client";
import { create } from "zustand";

export interface WorkspaceLaunchState {
	operations: Record<string, WorkspaceOperation>;
	pendingByKey: Record<string, string>;
}

export interface LaunchOptions {
	adapter: ProvisioningAdapter;
	request: ProvisionWorkspaceRequest;
}

export interface WorkspaceLaunchStoreApi {
	subscribe(adapter: ProvisioningAdapter): () => void;
	begin(options: LaunchOptions): Promise<WorkspaceOperation>;
	reconcile(adapter: ProvisioningAdapter): Promise<WorkspaceOperation[]>;
	retry(
		adapter: ProvisioningAdapter,
		operationId: string,
	): Promise<WorkspaceOperation>;
	cancel(
		adapter: ProvisioningAdapter,
		operationId: string,
	): Promise<WorkspaceOperation>;
	clear(): void;
}

interface WorkspaceLaunchStore
	extends WorkspaceLaunchState,
		WorkspaceLaunchStoreApi {}

export const useWorkspaceLaunchStore = create<WorkspaceLaunchStore>()(
	(set, get) => ({
		operations: {},
		pendingByKey: {},

		subscribe(adapter) {
			return adapter.subscribe((operation) => {
				set((state) => ({
					operations: { ...state.operations, [operation.id]: operation },
				}));
			});
		},

		async begin({ adapter, request }) {
			// Optimistic pending marker so React shows a loading indicator
			// between the click and the first server response.
			const previous = get().pendingByKey[request.idempotencyKey];
			if (previous) {
				const cached = get().operations[previous];
				if (cached) return cached;
			}
			const { operation } = await adapter.begin(request);
			set((state) => ({
				operations: { ...state.operations, [operation.id]: operation },
				pendingByKey: {
					...state.pendingByKey,
					[request.idempotencyKey]: operation.id,
				},
			}));
			return operation;
		},

		async reconcile(adapter) {
			const rows = await adapter.list();
			set((state) => {
				const next = { ...state.operations };
				for (const row of rows) next[row.id] = row;
				return { operations: next };
			});
			return rows;
		},

		async retry(adapter, operationId) {
			const op = await adapter.act({ operationId, action: "retry" });
			set((state) => ({
				operations: { ...state.operations, [op.id]: op },
			}));
			return op;
		},

		async cancel(adapter, operationId) {
			const op = await adapter.act({ operationId, action: "cancel" });
			set((state) => ({
				operations: { ...state.operations, [op.id]: op },
			}));
			return op;
		},

		clear() {
			set({ operations: {}, pendingByKey: {} });
		},
	}),
);

/**
 * Pure selectors, no zustand imports at the call site so the projection
 * can be reused by tests or non-hook contexts.
 */
export function selectOperationsByState(
	state: WorkspaceLaunchState,
	target: WorkspaceOperation["state"],
): WorkspaceOperation[] {
	return Object.values(state.operations).filter((op) => op.state === target);
}

export function selectPendingOperation(
	state: WorkspaceLaunchState,
	idempotencyKey: string,
): WorkspaceOperation | null {
	const id = state.pendingByKey[idempotencyKey];
	return id ? (state.operations[id] ?? null) : null;
}
