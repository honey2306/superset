/**
 * Workspace Provisioning client Adapter.
 *
 * Two implementations live here: the production Adapter that speaks tRPC
 * to a host-service, and an in-memory Adapter for renderer tests and the
 * Launch Coordinator's own unit tests. Both satisfy the same
 * `ProvisioningAdapter` interface so the Launch Coordinator can be tested
 * without a running server.
 *
 * This module intentionally stays free of React state — it is a thin
 * transport wrapper. The renderer store (`useWorkspaceLaunch`) sits on
 * top and manages projections/watchers.
 */
import type {
	InitialLaunchResult,
	ProvisionWorkspaceRequest,
	WorkspaceOperation,
	WorkspaceOperationState,
} from "@superset/host-service/workspace-provisioning";

export type {
	InitialLaunchResult,
	ProvisionWorkspaceRequest,
	WorkspaceOperation,
	WorkspaceOperationState,
} from "@superset/host-service/workspace-provisioning";

export interface ProvisioningAdapter {
	begin(
		request: ProvisionWorkspaceRequest,
	): Promise<{ operationId: string; operation: WorkspaceOperation }>;
	get(operationId: string): Promise<WorkspaceOperation | null>;
	list(args?: {
		states?: WorkspaceOperationState[];
	}): Promise<WorkspaceOperation[]>;
	act(args: {
		operationId: string;
		action: "retry" | "cancel";
	}): Promise<WorkspaceOperation>;
	subscribe(listener: (operation: WorkspaceOperation) => void): () => void;
}

// ── Production Adapter ────────────────────────────────────────────────

export interface ProvisioningAdapterFactoryDeps {
	// The tRPC client from `workspace-trpc.ts` — untyped here so this module
	// does not pull in the giant host AppRouter type surface, which slows
	// down tsc across the renderer and makes stubbing painful in tests.
	trpc: {
		workspaceProvisioning: {
			begin: {
				mutate: (
					input: ProvisionWorkspaceRequest,
				) => Promise<{ operationId: string; operation: WorkspaceOperation }>;
			};
			get: {
				query: (input: {
					operationId: string;
				}) => Promise<WorkspaceOperation | null>;
			};
			list: {
				query: (input: {
					states?: WorkspaceOperationState[];
				}) => Promise<WorkspaceOperation[]>;
			};
			act: {
				mutate: (input: {
					operationId: string;
					action: "retry" | "cancel";
				}) => Promise<WorkspaceOperation>;
			};
		};
	};
	/**
	 * Subscription callback registration. Production wires this to the
	 * `workspace-operation:changed` event bus; the in-memory Adapter fans
	 * out directly.
	 */
	subscribe: (listener: (operation: WorkspaceOperation) => void) => () => void;
}

export function createTrpcProvisioningAdapter(
	deps: ProvisioningAdapterFactoryDeps,
): ProvisioningAdapter {
	return {
		async begin(request) {
			return deps.trpc.workspaceProvisioning.begin.mutate(request);
		},
		async get(operationId) {
			try {
				return await deps.trpc.workspaceProvisioning.get.query({ operationId });
			} catch (err) {
				if (isTrpcNotFound(err)) return null;
				throw err;
			}
		},
		async list(args = {}) {
			return deps.trpc.workspaceProvisioning.list.query({
				states: args.states,
			});
		},
		async act(args) {
			return deps.trpc.workspaceProvisioning.act.mutate(args);
		},
		subscribe(listener) {
			return deps.subscribe(listener);
		},
	};
}

function isTrpcNotFound(err: unknown): boolean {
	if (typeof err !== "object" || err === null) return false;
	const data = (err as { data?: { code?: string } }).data;
	return data?.code === "NOT_FOUND";
}

// ── In-memory Adapter ─────────────────────────────────────────────────

/**
 * Deterministic in-memory Adapter for tests. Keeps a map of operations by
 * id and idempotency key; supports scripted outcomes via
 * `enqueueOutcome(fn)` so a test can pin exactly what a `begin` returns.
 */
export interface InMemoryAdapter extends ProvisioningAdapter {
	seedOperation(operation: WorkspaceOperation): void;
	enqueueOutcome(
		fn: (
			request: ProvisionWorkspaceRequest,
		) => Promise<WorkspaceOperation> | WorkspaceOperation,
	): void;
	broadcast(operation: WorkspaceOperation): void;
}

export function createInMemoryProvisioningAdapter(): InMemoryAdapter {
	const byId = new Map<string, WorkspaceOperation>();
	const byKey = new Map<string, WorkspaceOperation>();
	const scripted: Array<
		(
			request: ProvisionWorkspaceRequest,
		) => Promise<WorkspaceOperation> | WorkspaceOperation
	> = [];
	const listeners = new Set<(operation: WorkspaceOperation) => void>();

	const put = (op: WorkspaceOperation, key?: string) => {
		byId.set(op.id, op);
		if (key !== undefined) byKey.set(key, op);
		for (const listener of listeners) listener(op);
	};

	let opCounter = 0;

	return {
		async begin(request) {
			const key = request.idempotencyKey;
			const existing = byKey.get(key);
			if (existing) return { operationId: existing.id, operation: existing };
			const factory = scripted.shift();
			const now = Date.now();
			opCounter++;
			const defaultOp: WorkspaceOperation = {
				id: `in-memory-op-${opCounter}`,
				revision: 1,
				state: "succeeded",
				launches: [],
				warnings: [],
				workspaceId: `in-memory-workspace-${opCounter}`,
				projectId: `in-memory-project-${opCounter}`,
				disposition: "created",
				createdAt: now,
				updatedAt: now,
				completedAt: now,
			};
			const op = factory ? await factory(request) : defaultOp;
			put(op, key);
			return { operationId: op.id, operation: op };
		},
		async get(operationId) {
			return byId.get(operationId) ?? null;
		},
		async list(args = {}) {
			const rows = Array.from(byId.values());
			return args.states
				? rows.filter((r) => args.states?.includes(r.state))
				: rows;
		},
		async act(args) {
			const op = byId.get(args.operationId);
			if (!op) {
				throw new Error(`Operation ${args.operationId} not found`);
			}
			const now = Date.now();
			const next: WorkspaceOperation =
				args.action === "cancel"
					? {
							...op,
							state: "cancelled",
							revision: op.revision + 1,
							updatedAt: now,
							completedAt: now,
						}
					: {
							...op,
							state: "queued",
							revision: op.revision + 1,
							updatedAt: now,
							completedAt: undefined,
						};
			put(next);
			return next;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		seedOperation(op) {
			put(op);
		},
		enqueueOutcome(fn) {
			scripted.push(fn);
		},
		broadcast(op) {
			put(op);
		},
	};
}

// A hint to help the Launch Coordinator label failed operations that came
// from `attachable` results the terminal runtime didn't actually launch.
export function extractAttachableLaunches(
	launches: InitialLaunchResult[],
): InitialLaunchResult[] {
	return launches.filter((l) => l.kind === "terminal" && l.attachable);
}
