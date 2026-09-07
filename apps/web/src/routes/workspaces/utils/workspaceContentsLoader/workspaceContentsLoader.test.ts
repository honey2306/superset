import { expect, test } from "bun:test";
import {
	createWorkspaceContentsLoader,
	type WorkspaceContentsFetcher,
} from "./workspaceContentsLoader";

function createFetcher(): {
	fetcher: WorkspaceContentsFetcher;
	calls: string[];
	resolve: (workspaceId: string) => void;
} {
	const calls: string[] = [];
	const pending = new Map<string, () => void>();
	return {
		fetcher: (workspaceId) => {
			calls.push(workspaceId);
			return new Promise((resolve) => {
				pending.set(workspaceId, () =>
					resolve({
						acpEnabled: true,
						sessions: [],
						terminalSessions: [],
						terminalAgents: [],
					}),
				);
			});
		},
		calls,
		resolve: (workspaceId) => pending.get(workspaceId)?.(),
	};
}

test("loads only the initially expanded workspace and caches it", async () => {
	const { fetcher, calls, resolve } = createFetcher();
	const loader = createWorkspaceContentsLoader(fetcher);

	const firstLoad = loader.load("workspace-1");
	expect(calls).toEqual(["workspace-1"]);
	expect(loader.getState("workspace-2")).toBe("idle");

	resolve("workspace-1");
	await firstLoad;
	await loader.load("workspace-1");
	expect(calls).toEqual(["workspace-1"]);
});

test("shares in-flight loads and retries a failed workspace without affecting others", async () => {
	let attempts = 0;
	const calls: string[] = [];
	const loader = createWorkspaceContentsLoader(async (workspaceId) => {
		calls.push(workspaceId);
		if (workspaceId === "workspace-2" && attempts++ === 0) {
			throw new Error("offline");
		}
		return {
			acpEnabled: true,
			sessions: [],
			terminalSessions: [],
			terminalAgents: [],
		};
	});

	const first = loader.load("workspace-2");
	const second = loader.load("workspace-2");
	expect(first).toBe(second);
	await expect(first).rejects.toThrow("offline");
	expect(loader.getState("workspace-2")).toBe("error");

	await loader.load("workspace-3");
	await loader.load("workspace-2");
	expect(calls).toEqual(["workspace-2", "workspace-3", "workspace-2"]);
});

test("bounds concurrent workspace loads and starts queued work in order", async () => {
	const calls: string[] = [];
	const pending = new Map<string, (workspaceId: string) => void>();
	const contents = {
		acpEnabled: true,
		sessions: [],
		terminalSessions: [],
		terminalAgents: [],
	};
	const loader = createWorkspaceContentsLoader(
		async (workspaceId) => {
			calls.push(workspaceId);
			return new Promise((resolve) => {
				pending.set(workspaceId, () => resolve(contents));
			});
		},
		{ maxConcurrentRequests: 2 },
	);

	const loads = ["workspace-1", "workspace-2", "workspace-3"].map((id) =>
		loader.load(id),
	);
	expect(calls).toEqual(["workspace-1", "workspace-2"]);
	expect(loader.getState("workspace-3")).toBe("loading");

	pending.get("workspace-1")?.("workspace-1");
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(calls).toEqual(["workspace-1", "workspace-2", "workspace-3"]);

	pending.get("workspace-2")?.("workspace-2");
	pending.get("workspace-3")?.("workspace-3");
	await expect(Promise.all(loads)).resolves.toHaveLength(3);
});

test("a fourteen-workspace catalog loads one workspace initially, then one more on expand", async () => {
	const calls: string[] = [];
	const loader = createWorkspaceContentsLoader(async (workspaceId) => {
		calls.push(workspaceId);
		return {
			acpEnabled: true,
			sessions: [],
			terminalSessions: [],
			terminalAgents: [],
		};
	});
	const workspaceIds = Array.from(
		{ length: 14 },
		(_, index) => `workspace-${index + 1}`,
	);

	await loader.load(workspaceIds[0] ?? "");
	expect(calls).toEqual(["workspace-1"]);
	expect(
		workspaceIds.slice(1).every((id) => loader.getState(id) === "idle"),
	).toBe(true);

	await Promise.all([
		loader.load(workspaceIds[1] ?? ""),
		loader.load(workspaceIds[1] ?? ""),
	]);
	expect(calls).toEqual(["workspace-1", "workspace-2"]);
});
