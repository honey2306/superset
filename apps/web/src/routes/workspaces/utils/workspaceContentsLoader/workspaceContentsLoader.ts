import type { WorkspaceContents } from "../buildProjectTree/buildProjectTree";

export type WorkspaceContentsFetcher = (
	workspaceId: string,
) => Promise<WorkspaceContents>;

export type WorkspaceContentsLoadState =
	| "idle"
	| "loading"
	| "loaded"
	| "error";

/** Keep a catalog refresh from flooding the relay with one call per workspace. */
export const WORKSPACE_CONTENTS_MAX_CONCURRENT_REQUESTS = 2;

export type WorkspaceContentsLoaderOptions = {
	maxConcurrentRequests?: number;
};

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
	options: WorkspaceContentsLoaderOptions = {},
): WorkspaceContentsLoader {
	const contentsByWorkspaceId = new Map<string, WorkspaceContents>();
	const requestsByWorkspaceId = new Map<string, Promise<WorkspaceContents>>();
	const errorsByWorkspaceId = new Map<string, Error>();
	const queue: Array<{
		workspaceId: string;
		resolve: (contents: WorkspaceContents) => void;
		reject: (error: unknown) => void;
	}> = [];
	const maxConcurrentRequests = normalizeConcurrency(
		options.maxConcurrentRequests,
	);
	let activeRequests = 0;

	const drain = (): void => {
		while (activeRequests < maxConcurrentRequests && queue.length > 0) {
			const pending = queue.shift();
			if (!pending) return;
			activeRequests += 1;

			let fetchResult: Promise<WorkspaceContents>;
			try {
				fetchResult = fetchWorkspaceContents(pending.workspaceId);
			} catch (caught) {
				fetchResult = Promise.reject(caught);
			}
			void fetchResult
				.then((contents) => {
					contentsByWorkspaceId.set(pending.workspaceId, contents);
					return contents;
				})
				.catch((caught: unknown) => {
					const error =
						caught instanceof Error
							? caught
							: new Error("Failed to load workspace contents");
					errorsByWorkspaceId.set(pending.workspaceId, error);
					throw error;
				})
				.then(pending.resolve, pending.reject)
				.finally(() => {
					requestsByWorkspaceId.delete(pending.workspaceId);
					activeRequests -= 1;
					drain();
				});
		}
	};

	return {
		load(workspaceId) {
			const cached = contentsByWorkspaceId.get(workspaceId);
			if (cached) return Promise.resolve(cached);

			const pending = requestsByWorkspaceId.get(workspaceId);
			if (pending) return pending;

			errorsByWorkspaceId.delete(workspaceId);
			const request = new Promise<WorkspaceContents>((resolve, reject) => {
				queue.push({ workspaceId, resolve, reject });
			});
			requestsByWorkspaceId.set(workspaceId, request);
			drain();
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

function normalizeConcurrency(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return WORKSPACE_CONTENTS_MAX_CONCURRENT_REQUESTS;
	}
	return Math.max(1, Math.floor(value));
}
