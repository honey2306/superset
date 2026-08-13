import type { WorkspaceContents } from "../buildProjectTree/buildProjectTree";

export type WorkspaceContentsFetcher = (
	workspaceId: string,
) => Promise<WorkspaceContents>;

export type WorkspaceContentsLoadState =
	| "idle"
	| "loading"
	| "loaded"
	| "error";

export type WorkspaceContentsLoader = {
	load(workspaceId: string): Promise<WorkspaceContents>;
	get(workspaceId: string): WorkspaceContents | undefined;
	getState(workspaceId: string): WorkspaceContentsLoadState;
	getError(workspaceId: string): Error | undefined;
};

/**
 * Keeps workspace tab requests single-flight and caches successful responses.
 * Failed loads deliberately remain retryable, so one unavailable workspace does
 * not prevent the rest of the project tree from being used.
 */
export function createWorkspaceContentsLoader(
	fetchWorkspaceContents: WorkspaceContentsFetcher,
): WorkspaceContentsLoader {
	const contentsByWorkspaceId = new Map<string, WorkspaceContents>();
	const requestsByWorkspaceId = new Map<string, Promise<WorkspaceContents>>();
	const errorsByWorkspaceId = new Map<string, Error>();

	return {
		load(workspaceId) {
			const cached = contentsByWorkspaceId.get(workspaceId);
			if (cached) return Promise.resolve(cached);

			const pending = requestsByWorkspaceId.get(workspaceId);
			if (pending) return pending;

			errorsByWorkspaceId.delete(workspaceId);
			const request = fetchWorkspaceContents(workspaceId)
				.then((contents) => {
					contentsByWorkspaceId.set(workspaceId, contents);
					return contents;
				})
				.catch((caught: unknown) => {
					const error =
						caught instanceof Error
							? caught
							: new Error("Failed to load workspace contents");
					errorsByWorkspaceId.set(workspaceId, error);
					throw error;
				})
				.finally(() => {
					requestsByWorkspaceId.delete(workspaceId);
				});
			requestsByWorkspaceId.set(workspaceId, request);
			return request;
		},
		get(workspaceId) {
			return contentsByWorkspaceId.get(workspaceId);
		},
		getState(workspaceId) {
			if (contentsByWorkspaceId.has(workspaceId)) return "loaded";
			if (requestsByWorkspaceId.has(workspaceId)) return "loading";
			if (errorsByWorkspaceId.has(workspaceId)) return "error";
			return "idle";
		},
		getError(workspaceId) {
			return errorsByWorkspaceId.get(workspaceId);
		},
	};
}
