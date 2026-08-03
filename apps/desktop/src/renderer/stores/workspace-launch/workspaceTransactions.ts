import { create } from "zustand";

export type WorkspaceTransactionType = "insert" | "update" | "delete";
export type WorkspaceTransactionState = "pending" | "persisting";
export type TrackableWorkspaceTransactionState =
	| WorkspaceTransactionState
	| "completed"
	| "failed";

export interface WorkspaceTransactionSnapshot {
	id: string;
	workspaceId: string;
	type: WorkspaceTransactionType;
	state: WorkspaceTransactionState;
	createdAt: Date;
	updatedAt: Date;
}

interface TrackableWorkspaceTransaction {
	id: string;
	state: TrackableWorkspaceTransactionState;
	createdAt: Date;
	mutations: Array<{ type: WorkspaceTransactionType }>;
	isPersisted: {
		promise: Promise<unknown>;
	};
}

interface WorkspaceTransactionsState {
	byWorkspaceId: Record<string, WorkspaceTransactionSnapshot>;
	track: (
		workspaceId: string,
		transaction: TrackableWorkspaceTransaction,
	) => void;
	clear: (workspaceId: string) => void;
}

/**
 * Renderer-only pending mutation presentation for existing workspaces.
 * Workspace identity and persistence belong to the Host Catalog; this store
 * only lets legacy collection-action callers observe an in-flight update.
 */
export const useWorkspaceTransactionsStore = create<WorkspaceTransactionsState>(
	(set, get) => ({
		byWorkspaceId: {},
		track: (workspaceId, transaction) => {
			const mutation = transaction.mutations[0];
			if (!mutation) return;
			if (transaction.state === "completed" || transaction.state === "failed") {
				return;
			}

			const writeSnapshot = (state: WorkspaceTransactionState) => {
				set((current) => ({
					byWorkspaceId: {
						...current.byWorkspaceId,
						[workspaceId]: {
							id: transaction.id,
							workspaceId,
							type: mutation.type,
							state,
							createdAt: transaction.createdAt,
							updatedAt: new Date(),
						},
					},
				}));
			};

			writeSnapshot(transaction.state);

			void transaction.isPersisted.promise.then(
				() => {
					if (get().byWorkspaceId[workspaceId]?.id === transaction.id) {
						get().clear(workspaceId);
					}
				},
				() => {
					if (get().byWorkspaceId[workspaceId]?.id === transaction.id) {
						get().clear(workspaceId);
					}
				},
			);
		},
		clear: (workspaceId) =>
			set((state) => {
				if (!state.byWorkspaceId[workspaceId]) return state;
				const { [workspaceId]: _removed, ...rest } = state.byWorkspaceId;
				return { byWorkspaceId: rest };
			}),
	}),
);
