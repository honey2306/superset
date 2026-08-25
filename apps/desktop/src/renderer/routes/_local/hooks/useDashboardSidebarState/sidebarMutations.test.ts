import { describe, expect, it } from "bun:test";
import { selectWorkspacesToPlace } from "renderer/routes/_local/components/AgentHooks/hooks/usePlaceLocalWorktreesInSidebar/selectWorkspacesToPlace";
import {
	removeProjectFromSidebarState,
	type SidebarWorkspaceRow,
	tombstoneSidebarWorkspaceRecord,
} from "./sidebarMutations";

/**
 * Minimal in-memory stand-in for a TanStack DB collection, implementing only
 * the surface the sidebar mutations touch (`get`/`insert`/`update`/`delete`
 * plus a `.state` Map).
 */
function makeCollection<T>(getKey: (item: T) => string) {
	const state = new Map<string, T>();
	return {
		state,
		get: (key: string) => state.get(key),
		insert: (item: T) => {
			state.set(getKey(item), structuredClone(item));
		},
		update: (key: string, producer: (draft: T) => void) => {
			const existing = state.get(key);
			if (!existing) return;
			const draft = structuredClone(existing);
			producer(draft);
			state.set(key, draft);
		},
		delete: (keys: string | string[]) => {
			for (const key of Array.isArray(keys) ? keys : [keys]) {
				state.delete(key);
			}
		},
	};
}

type LocalStateRow = {
	workspaceId: string;
	createdAt: Date;
	sidebarState: {
		projectId: string;
		tabOrder: number;
		sectionId: string | null;
		isHidden: boolean;
	};
	paneLayout: { version: number; tabs: unknown[]; activeTabId: string | null };
};

function localStateRow(
	workspaceId: string,
	projectId: string,
	overrides: Partial<LocalStateRow["sidebarState"]> = {},
): LocalStateRow {
	return {
		workspaceId,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		sidebarState: {
			projectId,
			tabOrder: 1,
			sectionId: null,
			isHidden: false,
			...overrides,
		},
		paneLayout: { version: 1, tabs: [], activeTabId: null },
	};
}

function makeCollections() {
	return {
		workspaceLocalState: makeCollection<LocalStateRow>(
			(row) => row.workspaceId,
		),
		sidebarSections: makeCollection<{
			sectionId: string;
			projectId: string;
		}>((row) => row.sectionId),
		sidebarProjects: makeCollection<{ projectId: string }>(
			(row) => row.projectId,
		),
	};
}

type Collections = ReturnType<typeof makeCollections>;

// The functions accept the real `AppCollections` Pick; our fakes implement the
// touched subset, so cast through the parameter type.
function asRemoveArg(collections: Collections) {
	return collections as unknown as Parameters<
		typeof removeProjectFromSidebarState
	>[0];
}
function asTombstoneArg(collections: Collections) {
	return collections as unknown as Parameters<
		typeof tombstoneSidebarWorkspaceRecord
	>[0];
}

const noopCleanup = () => {};

describe("removeProjectFromSidebarState", () => {
	it("prevents the reconciler from re-placing any workspace after project removal", () => {
		const collections = makeCollections();
		const workspaces: SidebarWorkspaceRow[] = [
			{ id: "ws-main", projectId: "proj-1", type: "main" },
			{ id: "ws-worktree", projectId: "proj-1", type: "worktree" },
		];
		collections.sidebarProjects.insert({ projectId: "proj-1" });

		removeProjectFromSidebarState(
			asRemoveArg(collections),
			workspaces,
			"proj-1",
			noopCleanup,
		);

		const hiddenWorkspaceIds = new Set(
			Array.from(collections.workspaceLocalState.state.values())
				.filter((row) => row.sidebarState.isHidden)
				.map((row) => row.workspaceId),
		);

		expect(selectWorkspacesToPlace(workspaces, hiddenWorkspaceIds)).toEqual([]);
	});

	it("tombstones every catalog workspace — existing and row-less — and deletes sections and the project record", () => {
		const collections = makeCollections();
		// Explicitly-placed worktree (has a visible local-state row).
		collections.workspaceLocalState.insert(
			localStateRow("ws-placed", "proj-1", { sectionId: "sec-1" }),
		);
		const workspaces: SidebarWorkspaceRow[] = [
			{
				id: "ws-placed",
				projectId: "proj-1",
				type: "worktree",
			},
			// A catalog worktree with no row yet — the reconciler would re-pin it.
			{
				id: "ws-rowless",
				projectId: "proj-1",
				type: "worktree",
			},
		];
		collections.sidebarSections.insert({
			sectionId: "sec-1",
			projectId: "proj-1",
		});
		collections.sidebarProjects.insert({ projectId: "proj-1" });

		const cleaned: string[] = [];
		removeProjectFromSidebarState(
			asRemoveArg(collections),
			workspaces,
			"proj-1",
			(rows) => {
				for (const row of rows) cleaned.push(String(row.workspaceId));
			},
		);

		// Existing row hidden (kept); row-less worktree gets an inserted tombstone.
		expect(
			collections.workspaceLocalState.get("ws-placed")?.sidebarState.isHidden,
		).toBe(true);
		expect(
			collections.workspaceLocalState.get("ws-rowless")?.sidebarState.isHidden,
		).toBe(true);
		expect(collections.sidebarSections.get("sec-1")).toBeUndefined();
		expect(collections.sidebarProjects.get("proj-1")).toBeUndefined();
		// Only the pre-existing row had live runtimes to tear down.
		expect(cleaned).toEqual(["ws-placed"]);
	});

	it("tombstones the project's main workspaces so the reconciler cannot resurrect them", () => {
		const collections = makeCollections();
		collections.workspaceLocalState.insert(localStateRow("ws-main", "proj-1"));
		const workspaces: SidebarWorkspaceRow[] = [
			{ id: "ws-main", projectId: "proj-1", type: "main" },
			{
				id: "ws-main-rowless",
				projectId: "proj-1",
				type: "main",
			},
		];
		collections.sidebarProjects.insert({ projectId: "proj-1" });

		removeProjectFromSidebarState(
			asRemoveArg(collections),
			workspaces,
			"proj-1",
			noopCleanup,
		);

		// Both main rows are hidden, including the row-less catalog workspace.
		expect(
			collections.workspaceLocalState.get("ws-main")?.sidebarState.isHidden,
		).toBe(true);
		expect(
			collections.workspaceLocalState.get("ws-main-rowless")?.sidebarState
				.isHidden,
		).toBe(true);
		expect(collections.sidebarProjects.get("proj-1")).toBeUndefined();
	});

	it("leaves workspaces from other projects untouched", () => {
		const collections = makeCollections();
		collections.workspaceLocalState.insert(localStateRow("ws-other", "proj-2"));
		const workspaces: SidebarWorkspaceRow[] = [
			{
				id: "ws-other",
				projectId: "proj-2",
				type: "worktree",
			},
		];
		collections.sidebarProjects.insert({ projectId: "proj-1" });

		removeProjectFromSidebarState(
			asRemoveArg(collections),
			workspaces,
			"proj-1",
			noopCleanup,
		);

		expect(
			collections.workspaceLocalState.get("ws-other")?.sidebarState.isHidden,
		).toBe(false);
	});
});

describe("tombstoneSidebarWorkspaceRecord", () => {
	it("inserts a hidden row when none exists and does not run pane cleanup", () => {
		const collections = makeCollections();
		const cleaned: string[] = [];

		tombstoneSidebarWorkspaceRecord(
			asTombstoneArg(collections),
			"ws-new",
			"proj-1",
			(rows) => {
				for (const row of rows) cleaned.push(String(row.workspaceId));
			},
		);

		expect(
			collections.workspaceLocalState.get("ws-new")?.sidebarState.isHidden,
		).toBe(true);
		expect(cleaned).toEqual([]);
	});

	it("hides an existing row, clears its section, and runs pane cleanup", () => {
		const collections = makeCollections();
		collections.workspaceLocalState.insert(
			localStateRow("ws-1", "proj-1", { sectionId: "sec-1" }),
		);
		const cleaned: string[] = [];

		tombstoneSidebarWorkspaceRecord(
			asTombstoneArg(collections),
			"ws-1",
			"proj-1",
			(rows) => {
				for (const row of rows) cleaned.push(String(row.workspaceId));
			},
		);

		const row = collections.workspaceLocalState.get("ws-1");
		expect(row?.sidebarState.isHidden).toBe(true);
		expect(row?.sidebarState.sectionId).toBeNull();
		expect(cleaned).toEqual(["ws-1"]);
	});
});
