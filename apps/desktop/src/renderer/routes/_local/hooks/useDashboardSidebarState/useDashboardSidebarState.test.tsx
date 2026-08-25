import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { ensureHappyDom } from "test-utils/happy-dom-env";

type LocalRow = {
	workspaceId: string;
	createdAt: Date;
	sidebarState: {
		projectId: string;
		tabOrder: number;
		sectionId: string | null;
		isHidden: boolean;
	};
	paneLayout: { version: 1; tabs: []; activeTabId: null };
};

function createCollection<T>(keyOf: (row: T) => string) {
	const state = new Map<string, T>();
	return {
		state,
		get: (key: string) => state.get(key),
		insert: (row: T) => state.set(keyOf(row), structuredClone(row)),
		update: (key: string, update: (draft: T) => void) => {
			const row = state.get(key);
			if (!row) return;
			const draft = structuredClone(row);
			update(draft);
			state.set(key, draft);
		},
		delete: (keys: string | string[]) => {
			for (const key of Array.isArray(keys) ? keys : [keys]) state.delete(key);
		},
	};
}

const collections = {
	workspaceLocalState: createCollection<LocalRow>((row) => row.workspaceId),
	sidebarSections: createCollection<{
		sectionId: string;
		projectId: string;
		name: string;
		createdAt: Date;
		tabOrder: number;
		isCollapsed: boolean;
		color: string;
	}>((row) => row.sectionId),
	sidebarProjects: createCollection<{
		projectId: string;
		createdAt: Date;
		tabOrder: number;
		isCollapsed: boolean;
	}>((row) => row.projectId),
};

mock.module(
	"renderer/routes/_local/providers/LocalProductStateProvider",
	() => ({
		useLocalCollections: () => collections,
	}),
);
mock.module(
	"renderer/routes/_local/providers/WorkspaceCatalogProvider",
	() => ({
		useWorkspaceCatalog: () => ({ workspaces: [] }),
	}),
);
mock.module("renderer/lib/terminal/terminal-runtime-registry", () => ({
	terminalRuntimeRegistry: { release: () => {} },
}));
mock.module(
	"renderer/routes/_local/components/utils/paneLifecycleRows",
	() => ({
		extractPaneIds: () => [],
	}),
);

let act: typeof import("@testing-library/react/pure").act;
let renderHook: typeof import("@testing-library/react/pure").renderHook;
let useDashboardSidebarState: typeof import("./useDashboardSidebarState").useDashboardSidebarState;

beforeAll(async () => {
	await ensureHappyDom();
	({ act, renderHook } = await import("@testing-library/react/pure"));
	({ useDashboardSidebarState } = await import("./useDashboardSidebarState"));
});

beforeEach(() => {
	collections.workspaceLocalState.state.clear();
	collections.sidebarSections.state.clear();
	collections.sidebarProjects.state.clear();
});

describe("useDashboardSidebarState", () => {
	test("heals a visible workspace row whose persisted project is stale", () => {
		collections.sidebarProjects.insert({
			projectId: "project-canonical",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: false,
		});
		collections.workspaceLocalState.insert({
			workspaceId: "workspace-1",
			createdAt: new Date(),
			sidebarState: {
				projectId: "project-stale",
				tabOrder: 7,
				sectionId: "section-stale",
				isHidden: false,
			},
			paneLayout: { version: 1, tabs: [], activeTabId: null },
		});

		const { result } = renderHook(() => useDashboardSidebarState());
		act(() => {
			result.current.ensureWorkspaceInSidebar(
				"workspace-1",
				"project-canonical",
			);
		});

		expect(collections.workspaceLocalState.get("workspace-1")).toMatchObject({
			sidebarState: {
				projectId: "project-canonical",
				sectionId: null,
				isHidden: false,
				tabOrder: 1,
			},
		});
	});
});
