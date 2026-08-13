import { toast } from "@superset/ui/sonner";
import { useCallback, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import {
	type TrackableWorkspaceTransactionState,
	useWorkspaceTransactionsStore,
	type WorkspaceTransactionType,
} from "renderer/stores/workspace-launch/workspaceTransactions";

export type PersistableTransaction = {
	id: string;
	state: TrackableWorkspaceTransactionState;
	createdAt: Date;
	mutations: Array<{ type: WorkspaceTransactionType }>;
	isPersisted: {
		promise: Promise<unknown>;
	};
};

interface WorkspacePatch {
	name?: string;
	branch?: string;
	taskId?: string | null;
}

/**
 * Host workspace writes aren't collection transactions, but the pending-
 * rename UI tracks transaction-shaped objects; wrap the host mutate
 * promise in one.
 */
function makeHostWorkspaceTransaction(
	type: WorkspaceTransactionType,
	promise: Promise<unknown>,
): PersistableTransaction {
	return {
		id: crypto.randomUUID(),
		state: "persisting",
		createdAt: new Date(),
		mutations: [{ type }],
		isPersisted: { promise },
	};
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}

	if (typeof error === "string" && error.trim()) {
		return error;
	}

	return "The local change was rolled back.";
}

function useOptimisticMutationRunner() {
	const reportFailure = useCallback(
		(scope: string, title: string, error: unknown) => {
			console.error(`[${scope}] ${title}:`, error);
			toast.error(title, {
				description: getErrorMessage(error),
			});
		},
		[],
	);

	return useCallback(
		(
			scope: string,
			failureTitle: string,
			mutation: () => PersistableTransaction,
		): PersistableTransaction | null => {
			try {
				const transaction = mutation();

				void transaction.isPersisted.promise.catch((error) => {
					reportFailure(scope, failureTitle, error);
				});

				return transaction;
			} catch (error) {
				reportFailure(scope, failureTitle, error);
				return null;
			}
		},
		[reportFailure],
	);
}

export function useOptimisticCollectionActions() {
	const { activeHostUrl } = useLocalHostService();
	const runMutation = useOptimisticMutationRunner();
	const trackWorkspaceTransaction = useWorkspaceTransactionsStore(
		(state) => state.track,
	);

	return useMemo(() => {
		const runWorkspaceMutation = (
			failureTitle: string,
			mutation: () => PersistableTransaction,
		) => runMutation("optimistic.workspaces", failureTitle, mutation);

		return {
			workspaces: {
				// Workspace records are host-owned: the write goes to the owning
				// host, the cache is patched optimistically, and the host's
				// workspace:changed broadcast (or a rollback refetch) converges it.
				updateWorkspace: (workspaceId: string, patch: WorkspacePatch) => {
					const transaction = runWorkspaceMutation(
						"Failed to update workspace",
						() => {
							if (!activeHostUrl) {
								throw new Error("The local host is still starting.");
							}
							const promise = getHostServiceClientByUrl(
								activeHostUrl,
							).workspace.update.mutate({
								id: workspaceId,
								name: patch.name,
								branch: patch.branch,
								taskId: patch.taskId,
							});
							return makeHostWorkspaceTransaction("update", promise);
						},
					);
					if (transaction) {
						trackWorkspaceTransaction(workspaceId, transaction);
					}
					return transaction;
				},
				renameWorkspace: (workspaceId: string, name: string) => {
					const transaction = runWorkspaceMutation(
						"Failed to rename workspace",
						() => {
							if (!activeHostUrl) {
								throw new Error("The local host is still starting.");
							}
							const promise = getHostServiceClientByUrl(
								activeHostUrl,
							).workspace.update.mutate({ id: workspaceId, name });
							return makeHostWorkspaceTransaction("update", promise);
						},
					);
					if (transaction) {
						trackWorkspaceTransaction(workspaceId, transaction);
					}
					return transaction;
				},
			},
		};
	}, [activeHostUrl, runMutation, trackWorkspaceTransaction]);
}
