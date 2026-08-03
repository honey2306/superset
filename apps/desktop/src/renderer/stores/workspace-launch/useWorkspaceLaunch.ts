import type { ProvisioningAdapter } from "@superset/workspace-client";
import { useEffect, useMemo } from "react";
import {
	selectOperationForWorkspace,
	selectOperationsByState,
	selectPendingOperation,
	useWorkspaceLaunchStore,
	type WorkspaceLaunchState,
} from "./workspaceLaunchStore";

export interface UseWorkspaceLaunchApi {
	begin: (args: {
		adapter: ProvisioningAdapter;
		request: Parameters<
			ReturnType<typeof useWorkspaceLaunchStore.getState>["begin"]
		>[0]["request"];
	}) => ReturnType<
		ReturnType<typeof useWorkspaceLaunchStore.getState>["begin"]
	>;
	retry: (
		adapter: ProvisioningAdapter,
		operationId: string,
	) => ReturnType<ReturnType<typeof useWorkspaceLaunchStore.getState>["retry"]>;
	cancel: (
		adapter: ProvisioningAdapter,
		operationId: string,
	) => ReturnType<
		ReturnType<typeof useWorkspaceLaunchStore.getState>["cancel"]
	>;
	pending: (
		idempotencyKey: string,
	) => ReturnType<typeof selectPendingOperation>;
	forWorkspace: (
		workspaceId: string,
	) => ReturnType<typeof selectOperationForWorkspace>;
	byState: (
		state: Parameters<typeof selectOperationsByState>[1],
	) => ReturnType<typeof selectOperationsByState>;
}

/**
 * React hook wrapper around the Launch Coordinator store. On mount it
 * subscribes the store to the given Adapter (fanning out
 * `workspace-operation:changed` broadcasts), and on unmount it releases
 * the subscription. Callers pass the request in via `begin`; the store
 * keeps the projection up-to-date across renders.
 */
export function useWorkspaceLaunch(
	adapter: ProvisioningAdapter | null,
): UseWorkspaceLaunchApi {
	const begin = useWorkspaceLaunchStore((s) => s.begin);
	const retry = useWorkspaceLaunchStore((s) => s.retry);
	const cancel = useWorkspaceLaunchStore((s) => s.cancel);
	const subscribe = useWorkspaceLaunchStore((s) => s.subscribe);
	const reconcile = useWorkspaceLaunchStore((s) => s.reconcile);
	const operations = useWorkspaceLaunchStore((s) => s.operations);
	const pendingByKey = useWorkspaceLaunchStore((s) => s.pendingByKey);
	const state = useMemo(
		() => ({ operations, pendingByKey }) as WorkspaceLaunchState,
		[operations, pendingByKey],
	);

	useEffect(() => {
		if (!adapter) return;
		const unsubscribe = subscribe(adapter);
		void reconcile(adapter).catch(() => {
			// Reconciliation failure is non-fatal — the store already
			// contains whatever the last successful call filled in, and
			// the next event delivery will fill in more.
		});
		return unsubscribe;
	}, [adapter, reconcile, subscribe]);

	return useMemo<UseWorkspaceLaunchApi>(
		() => ({
			begin: ({ adapter: begunAdapter, request }) =>
				begin({ adapter: begunAdapter, request }),
			retry: (adapterArg, operationId) => retry(adapterArg, operationId),
			cancel: (adapterArg, operationId) => cancel(adapterArg, operationId),
			pending: (idempotencyKey) =>
				selectPendingOperation(state, idempotencyKey),
			forWorkspace: (workspaceId) =>
				selectOperationForWorkspace(state, workspaceId),
			byState: (target) => selectOperationsByState(state, target),
		}),
		[begin, cancel, retry, state],
	);
}
