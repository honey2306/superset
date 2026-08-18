import { beforeAll, describe, expect, mock, test } from "bun:test";
import { ensureHappyDom } from "test-utils/happy-dom-env";

let liveQueryResults: unknown[] = [];
let liveQueryCall = 0;

mock.module("@tanstack/react-db", () => ({
	useLiveQuery: () => ({ data: liveQueryResults[liveQueryCall++] }),
}));
mock.module("@tanstack/react-router", () => ({
	useNavigate: () => () => {},
}));
mock.module("renderer/hotkeys", () => ({
	useHotkey: () => {},
}));
mock.module(
	"renderer/routes/_local/providers/LocalProductStateProvider",
	() => ({
		useLocalCollections: () => ({}),
	}),
);
mock.module(
	"renderer/routes/_local/providers/WorkspaceCatalogProvider",
	() => ({
		useWorkspaceCatalog: () => ({
			projects: [
				{ id: "project-a", kind: "local", repoPath: "/a", name: "A" },
				{ id: "project-b", kind: "local", repoPath: "/b", name: "B" },
			],
			workspaces: [],
		}),
	}),
);

let renderHook: typeof import("@testing-library/react/pure").renderHook;
let useWorkspaceShortcuts: typeof import("./useWorkspaceShortcuts").useWorkspaceShortcuts;

beforeAll(async () => {
	await ensureHappyDom();
	({ renderHook } = await import("@testing-library/react/pure"));
	({ useWorkspaceShortcuts } = await import("./useWorkspaceShortcuts"));
});

describe("useWorkspaceShortcuts", () => {
	test("renders projects in the order persisted by a project drag", () => {
		liveQueryCall = 0;
		liveQueryResults = [
			[],
			[
				{ projectId: "project-a", tabOrder: 2 },
				{ projectId: "project-b", tabOrder: 1 },
			],
			[],
		];

		const { result } = renderHook(() => useWorkspaceShortcuts());

		expect(result.current.groups.map((group) => group.project.id)).toEqual([
			"project-b",
			"project-a",
		]);
	});
});
