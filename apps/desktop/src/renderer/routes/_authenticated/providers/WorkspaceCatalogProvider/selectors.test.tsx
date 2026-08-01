import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import type { WorkspaceCatalogSnapshot } from "@superset/host-service/workspace-catalog";
import type { ReactNode } from "react";

let renderHook: typeof import("@testing-library/react/pure").renderHook;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let unregisterDom: () => void;

let installSnapshot: typeof import("./catalogProjection").installSnapshot;
let WorkspaceCatalogProvider: typeof import("./WorkspaceCatalogProvider").WorkspaceCatalogProvider;
let useCatalogWorkspace: typeof import("./selectors").useCatalogWorkspace;
let useCatalogWorkspacesByProject: typeof import("./selectors").useCatalogWorkspacesByProject;
let useCatalogProject: typeof import("./selectors").useCatalogProject;
let useCatalogWorkspaceNeighbours: typeof import("./selectors").useCatalogWorkspaceNeighbours;

const project = (id: string): WorkspaceCatalogSnapshot["projects"][number] => ({
	id,
	kind: "repository",
	singletonKey: null,
	name: id,
	repoPath: `/tmp/${id}`,
	repoProvider: null,
	repoOwner: null,
	repoName: null,
	repoUrl: null,
	remoteName: null,
	worktreeBaseDir: null,
	branchPrefixMode: null,
	branchPrefixCustom: null,
	createdAt: 1,
	updatedAt: 1,
});

const workspace = (
	id: string,
	projectId: string,
	createdAt: number,
): WorkspaceCatalogSnapshot["workspaces"][number] => ({
	id,
	projectId,
	name: id,
	type: "worktree",
	worktreePath: `/tmp/${projectId}/${id}`,
	branch: `branch/${id}`,
	headSha: null,
	upstreamOwner: null,
	upstreamRepo: null,
	upstreamBranch: null,
	pullRequestId: null,
	taskId: null,
	createdByUserId: null,
	createdAt,
	updatedAt: createdAt,
});

const snapshot: WorkspaceCatalogSnapshot = {
	schemaVersion: 1,
	revision: 10,
	projects: [project("proj-a"), project("proj-b")],
	workspaces: [
		workspace("w1", "proj-a", 1),
		workspace("w2", "proj-a", 2),
		workspace("w3", "proj-a", 3),
		workspace("w4", "proj-b", 4),
	],
	health: { unresolvedIdentityConflicts: 0 },
};

const wrapperFactory =
	() =>
	({ children }: { children: ReactNode }) => (
		<WorkspaceCatalogProvider initialState={installSnapshot(snapshot)}>
			{children}
		</WorkspaceCatalogProvider>
	);

describe("catalog selectors", () => {
	beforeAll(async () => {
		const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
		GlobalRegistrator.register();
		unregisterDom = () => GlobalRegistrator.unregister();
		({ renderHook, cleanup } = await import("@testing-library/react/pure"));
		({ installSnapshot } = await import("./catalogProjection"));
		({ WorkspaceCatalogProvider } = await import("./WorkspaceCatalogProvider"));
		({
			useCatalogWorkspace,
			useCatalogWorkspacesByProject,
			useCatalogProject,
			useCatalogWorkspaceNeighbours,
		} = await import("./selectors"));
	});

	afterEach(() => cleanup());
	afterAll(() => unregisterDom());

	test("useCatalogWorkspace returns null for unknown id", () => {
		const { result } = renderHook(() => useCatalogWorkspace("nope"), {
			wrapper: wrapperFactory(),
		});
		expect(result.current.workspace).toBeNull();
	});

	test("useCatalogWorkspace returns the row for a known id", () => {
		const { result } = renderHook(() => useCatalogWorkspace("w2"), {
			wrapper: wrapperFactory(),
		});
		expect(result.current.workspace?.id).toBe("w2");
		expect(result.current.workspace?.projectId).toBe("proj-a");
	});

	test("useCatalogWorkspacesByProject filters to that project only", () => {
		const { result } = renderHook(
			() => useCatalogWorkspacesByProject("proj-a"),
			{ wrapper: wrapperFactory() },
		);
		expect(result.current.workspaces.map((w) => w.id)).toEqual([
			"w1",
			"w2",
			"w3",
		]);
	});

	test("useCatalogProject returns null for unknown and row for known", () => {
		const missing = renderHook(() => useCatalogProject("nope"), {
			wrapper: wrapperFactory(),
		});
		expect(missing.result.current.project).toBeNull();
		const hit = renderHook(() => useCatalogProject("proj-b"), {
			wrapper: wrapperFactory(),
		});
		expect(hit.result.current.project?.id).toBe("proj-b");
	});

	test("useCatalogWorkspaceNeighbours navigates within same project", () => {
		const { result } = renderHook(() => useCatalogWorkspaceNeighbours("w2"), {
			wrapper: wrapperFactory(),
		});
		expect(result.current.previous?.id).toBe("w1");
		expect(result.current.next?.id).toBe("w3");
	});

	test("useCatalogWorkspaceNeighbours: boundaries return null on each side", () => {
		const first = renderHook(() => useCatalogWorkspaceNeighbours("w1"), {
			wrapper: wrapperFactory(),
		});
		expect(first.result.current.previous).toBeNull();
		expect(first.result.current.next?.id).toBe("w2");
		const last = renderHook(() => useCatalogWorkspaceNeighbours("w3"), {
			wrapper: wrapperFactory(),
		});
		expect(last.result.current.previous?.id).toBe("w2");
		expect(last.result.current.next).toBeNull();
	});
});
