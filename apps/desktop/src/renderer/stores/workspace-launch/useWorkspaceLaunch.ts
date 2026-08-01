import { useEffect, useMemo } from "react";
import type { ProvisioningAdapter } from "@superset/workspace-client";
import {
	selectOperationsByState,
	selectPendingOperation,
	type WorkspaceLaunchState,
	useWorkspaceLaunchStore,
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
	) => ReturnType<
		ReturnType<typeof useWorkspaceLaunchStore.getState>["retry"]
	>;
	cancel: (
		adapter: ProvisioningAdapter,
		operationId: string,
	) => ReturnType<
		ReturnType<typeof useWorkspaceLaunchStore.getState>["cancel"]
	>;
	pending: (idempotencyKey: string) => ReturnType<
		typeof selectPendingOperation
	>;
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
	const store = useWorkspaceLaunchStore();
	const state = useWorkspaceLaunchStore(
		(s) => ({
			operations: s.operations,
			pendingByKey: s.pendingByKey,
		}) as WorkspaceLaunchState,
	);

	useEffect(() => {
		if (!adapter) return;
		const unsubscribe = store.subscribe(adapter);
		void store.reconcile(adapter).catch(() => {
			// Reconciliation failure is non-fatal — the store already
			// contains whatever the last successful call filled in, and
			// the next event delivery will fill in more.
		});
		return unsubscribe;
	}, [adapter, store]);

	return useMemo<UseWorkspaceLaunchApi>(
		() => ({
			begin: ({ adapter: begunAdapter, request }) =>
				store.begin({ adapter: begunAdapter, request }),
			retry: (adapterArg, operationId) => store.retry(adapterArg, operationId),
			cancel: (adapterArg, operationId) => store.cancel(adapterArg, operationId),
			pending: (idempotencyKey) => selectPendingOperation(state, idempotencyKey),
			byState: (target) => selectOperationsByState(state, target),
		}),
		[store, state],
	);
}
