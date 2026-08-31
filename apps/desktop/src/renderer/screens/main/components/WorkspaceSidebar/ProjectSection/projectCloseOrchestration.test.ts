import { describe, expect, test } from "bun:test";
import type { DisposeHostSessionsResult } from "renderer/lib/dispose-host-sessions";
import { closeProjectImmediately } from "./projectCloseOrchestration";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

const DISPOSE_RESULT: DisposeHostSessionsResult = {
	terminated: 1,
	failed: 0,
	unreachableHosts: 0,
	coordinatorUnavailable: false,
};

describe("closeProjectImmediately", () => {
	test("completes the foreground close before host disposal settles", async () => {
		const events: string[] = [];
		const disposal = deferred<DisposeHostSessionsResult>();
		let handledResult: DisposeHostSessionsResult | undefined;
		let retry: (() => Promise<DisposeHostSessionsResult>) | undefined;

		closeProjectImmediately({
			projectId: "project-1",
			projectWorkspaces: [{ id: "workspace-1" }],
			shouldNavigate: true,
			removeProjectFromSidebar: (projectId) => {
				events.push(`remove:${projectId}`);
			},
			closeDialog: () => {
				events.push("dialog:close");
			},
			navigate: () => {
				events.push("navigate");
			},
			disposeWorkspaceSessions: (workspaceId) => {
				events.push(`dispose:start:${workspaceId}`);
				return disposal.promise;
			},
			onDisposeResult: (result, disposeAgain) => {
				handledResult = result;
				retry = disposeAgain;
				events.push("dispose:handled");
			},
			onDisposeError: () => {
				events.push("dispose:error");
			},
		});

		expect(events).toEqual([
			"remove:project-1",
			"dialog:close",
			"navigate",
			"dispose:start:workspace-1",
		]);
		expect(handledResult).toBeUndefined();

		disposal.resolve(DISPOSE_RESULT);
		await disposal.promise;
		await Promise.resolve();

		expect(events).toEqual([
			"remove:project-1",
			"dialog:close",
			"navigate",
			"dispose:start:workspace-1",
			"dispose:handled",
		]);
		expect(handledResult).toBe(DISPOSE_RESULT);
		expect(retry).toEqual(expect.any(Function));
	});

	test("surfaces unexpected background disposal errors without rejecting the close", async () => {
		const disposal = deferred<DisposeHostSessionsResult>();
		const errors: unknown[] = [];

		closeProjectImmediately({
			projectId: "project-1",
			projectWorkspaces: [{ id: "workspace-1" }],
			shouldNavigate: false,
			removeProjectFromSidebar: () => {},
			closeDialog: () => {},
			navigate: () => {},
			disposeWorkspaceSessions: () => disposal.promise,
			onDisposeResult: () => {},
			onDisposeError: (error) => {
				errors.push(error);
			},
		});

		const error = new Error("host unavailable");
		disposal.reject(error);
		await disposal.promise.catch(() => undefined);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(errors).toEqual([error]);
	});
});
