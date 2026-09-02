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
		groupId: string | null;
	}>((row) => row.projectId),
	sidebarProjectGroups: createCollection<{
		groupId: string;
		name: string;
		createdAt: Date;
		tabOrder: number;
		isCollapsed: boolean;
	}>((row) => row.groupId),
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
	collections.sidebarProjectGroups.state.clear();
});

describe("useDashboardSidebarState", () => {
	test("heals a visible workspace row whose persisted project is stale", () => {
		collections.sidebarProjects.insert({
			projectId: "project-canonical",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: false,
			groupId: null,
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

describe("project group mutations", () => {
	test("createProjectGroup creates a group with given name", () => {
		const { result } = renderHook(() => useDashboardSidebarState());
		let groupId = "";
		act(() => {
			groupId = result.current.createProjectGroup({ name: "Frontend" });
		});
		const group = collections.sidebarProjectGroups.get(groupId);
		expect(group).toBeDefined();
		expect(group?.name).toBe("Frontend");
		expect(group?.isCollapsed).toBe(false);
	});

	test("createProjectGroup moves projectIds into the new group", () => {
		collections.sidebarProjects.insert({
			projectId: "proj-1",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: false,
			groupId: null,
		});
		const { result } = renderHook(() => useDashboardSidebarState());
		let groupId = "";
		act(() => {
			groupId = result.current.createProjectGroup({ projectIds: ["proj-1"] });
		});
		expect(collections.sidebarProjects.get("proj-1")?.groupId).toBe(groupId);
	});

	test("renameProjectGroup updates the name", () => {
		collections.sidebarProjectGroups.insert({
			groupId: "grp-1",
			name: "Old",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: false,
		});
		const { result } = renderHook(() => useDashboardSidebarState());
		act(() => {
			result.current.renameProjectGroup("grp-1", "  New Name  ");
		});
		expect(collections.sidebarProjectGroups.get("grp-1")?.name).toBe(
			"New Name",
		);
	});

	test("toggleProjectGroupCollapsed flips isCollapsed", () => {
		collections.sidebarProjectGroups.insert({
			groupId: "grp-1",
			name: "G",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: false,
		});
		const { result } = renderHook(() => useDashboardSidebarState());
		act(() => {
			result.current.toggleProjectGroupCollapsed("grp-1");
		});
		expect(collections.sidebarProjectGroups.get("grp-1")?.isCollapsed).toBe(
			true,
		);
	});

	test("deleteProjectGroup removes group and sets projects groupId to null", () => {
		collections.sidebarProjectGroups.insert({
			groupId: "grp-1",
			name: "G",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: false,
		});
		collections.sidebarProjects.insert({
			projectId: "proj-a",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: false,
			groupId: "grp-1",
		});
		collections.sidebarProjects.insert({
			projectId: "proj-ungrouped",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: false,
			groupId: null,
		});
		const { result } = renderHook(() => useDashboardSidebarState());
		act(() => {
			result.current.deleteProjectGroup("grp-1");
		});
		expect(collections.sidebarProjectGroups.get("grp-1")).toBeUndefined();
		expect(collections.sidebarProjects.get("proj-a")).toMatchObject({
			groupId: null,
			tabOrder: 2,
		});
		expect(collections.sidebarProjects.get("proj-ungrouped")?.tabOrder).toBe(1);
	});

	test("moveProjectToGroup moves a project into a group", () => {
		collections.sidebarProjects.insert({
			projectId: "proj-1",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: false,
			groupId: null,
		});
		collections.sidebarProjectGroups.insert({
			groupId: "grp-1",
			name: "G",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: false,
		});
		const { result } = renderHook(() => useDashboardSidebarState());
		act(() => {
			result.current.moveProjectToGroup("proj-1", "grp-1");
		});
		expect(collections.sidebarProjects.get("proj-1")?.groupId).toBe("grp-1");
	});

	test("moveProjectToGroup with toIndex inserts at correct position", () => {
		collections.sidebarProjectGroups.insert({
			groupId: "grp-1",
			name: "G",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: false,
		});
		collections.sidebarProjects.insert({
			projectId: "proj-a",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: false,
			groupId: "grp-1",
		});
		collections.sidebarProjects.insert({
			projectId: "proj-b",
			createdAt: new Date(),
			tabOrder: 2,
			isCollapsed: false,
			groupId: "grp-1",
		});
		collections.sidebarProjects.insert({
			projectId: "proj-c",
			createdAt: new Date(),
			tabOrder: 10,
			isCollapsed: false,
			groupId: null,
		});
		const { result } = renderHook(() => useDashboardSidebarState());
		act(() => {
			result.current.moveProjectToGroup("proj-c", "grp-1", 1);
		});
		const a = collections.sidebarProjects.get("proj-a");
		const b = collections.sidebarProjects.get("proj-b");
		const c = collections.sidebarProjects.get("proj-c");
		expect(c?.groupId).toBe("grp-1");
		// proj-c inserted at index 1: order should be [proj-a, proj-c, proj-b]
		expect(a?.tabOrder).toBeLessThan(c?.tabOrder ?? 0);
		expect(c?.tabOrder).toBeLessThan(b?.tabOrder ?? 0);
	});

	test("reorderProjectGroups assigns tabOrder by array position", () => {
		collections.sidebarProjectGroups.insert({
			groupId: "grp-1",
			name: "A",
			createdAt: new Date(),
			tabOrder: 2,
			isCollapsed: false,
		});
		collections.sidebarProjectGroups.insert({
			groupId: "grp-2",
			name: "B",
			createdAt: new Date(),
			tabOrder: 1,
			isCollapsed: false,
		});
		const { result } = renderHook(() => useDashboardSidebarState());
		act(() => {
			result.current.reorderProjectGroups(["grp-1", "grp-2"]);
		});
		expect(collections.sidebarProjectGroups.get("grp-1")?.tabOrder).toBe(1);
		expect(collections.sidebarProjectGroups.get("grp-2")?.tabOrder).toBe(2);
	});
});
