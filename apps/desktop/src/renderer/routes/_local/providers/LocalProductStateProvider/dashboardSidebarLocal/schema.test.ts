import { describe, expect, it } from "bun:test";
import type { WorkspaceState } from "@superset/panes";
import {
	DEFAULT_USER_PREFERENCES,
	dashboardSidebarProjectGroupSchema,
	dashboardSidebarProjectSchema,
	healUserPreferences,
	healWorkspaceLocalState,
	sanitizePaneLayout,
} from "./schema";

type PaneLayout = WorkspaceState<unknown>;

describe("dashboardSidebarProjectSchema groupId", () => {
	it("parses an old row without groupId as groupId: null", () => {
		const oldRow = {
			projectId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
			createdAt: new Date("2026-01-01"),
			isCollapsed: false,
			tabOrder: 1,
			defaultOpenInApp: null,
			color: null,
			hideImage: false,
		};
		const parsed = dashboardSidebarProjectSchema.parse(oldRow);
		expect(parsed.groupId).toBeNull();
	});

	it("parses a new row with a valid groupId uuid", () => {
		const row = {
			projectId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
			createdAt: new Date("2026-01-01"),
			groupId: "b1ffcd00-0d1c-4fa9-8b6e-7cc0ce491b22",
		};
		const parsed = dashboardSidebarProjectSchema.parse(row);
		expect(parsed.groupId).toBe("b1ffcd00-0d1c-4fa9-8b6e-7cc0ce491b22");
	});
});

describe("dashboardSidebarProjectGroupSchema", () => {
	it("parses a valid group row", () => {
		const row = {
			groupId: "c2aadd11-1e2d-4fb8-9d8f-8dd1df502c33",
			name: "My Group",
			createdAt: new Date("2026-01-01"),
		};
		const parsed = dashboardSidebarProjectGroupSchema.parse(row);
		expect(parsed.groupId).toBe(row.groupId);
		expect(parsed.name).toBe("My Group");
		expect(parsed.tabOrder).toBe(0);
		expect(parsed.isCollapsed).toBe(false);
	});

	it("trims whitespace from name and rejects empty name", () => {
		const base = {
			groupId: "c2aadd11-1e2d-4fb8-9d8f-8dd1df502c33",
			createdAt: new Date(),
		};
		const trimmed = dashboardSidebarProjectGroupSchema.parse({
			...base,
			name: "  hello  ",
		});
		expect(trimmed.name).toBe("hello");

		expect(() =>
			dashboardSidebarProjectGroupSchema.parse({ ...base, name: "   " }),
		).toThrow();
	});
});

describe("healUserPreferences", () => {
	it("returns full defaults for empty/non-object input", () => {
		expect(healUserPreferences({})).toEqual(DEFAULT_USER_PREFERENCES);
		expect(healUserPreferences(null)).toEqual(DEFAULT_USER_PREFERENCES);
		expect(healUserPreferences(undefined)).toEqual(DEFAULT_USER_PREFERENCES);
	});

	it("preserves stored top-level fields and fills missing ones", () => {
		const stored = { rightSidebarWidth: 500 };
		const healed = healUserPreferences(stored);
		expect(healed.rightSidebarWidth).toBe(500);
		expect(healed.terminalPresetsInitialized).toBe(false);
		expect(healed.sidebarFileLinks).toEqual(
			DEFAULT_USER_PREFERENCES.sidebarFileLinks,
		);
		expect(healed.fileLinks).toEqual(DEFAULT_USER_PREFERENCES.fileLinks);
	});

	it("preserves the terminal presets initialization sentinel", () => {
		const healed = healUserPreferences({
			terminalPresetsInitialized: true,
		});

		expect(healed.terminalPresetsInitialized).toBe(true);
	});

	it("reproduces the original crash shape: missing sidebarFileLinks entirely", () => {
		// Shape of rows persisted before sidebarFileLinks was added in e8067e196.
		const stored = {
			id: "preferences",
			fileLinks: { plain: null, shift: null, meta: "pane", metaShift: null },
			urlLinks: { plain: null, shift: null, meta: "pane", metaShift: null },
			rightSidebarTab: "changes",
			rightSidebarWidth: 340,
			deleteLocalBranch: false,
		};
		const healed = healUserPreferences(stored);
		expect(healed.sidebarFileLinks).toEqual(
			DEFAULT_USER_PREFERENCES.sidebarFileLinks,
		);
		// Every tier defined — the property buildHint reads.
		expect(healed.sidebarFileLinks.shift).toBeDefined();
	});

	it("fills missing tiers inside an otherwise-present tier map", () => {
		// Hypothetical future shape: sidebarFileLinks exists but a tier was added
		// to the schema after this row was written.
		const stored = {
			sidebarFileLinks: { plain: "pane", meta: "external" },
		};
		const healed = healUserPreferences(stored);
		expect(healed.sidebarFileLinks.plain).toBe("pane");
		expect(healed.sidebarFileLinks.meta).toBe("external");
		// Tiers absent from the stored row fall back to defaults.
		expect(healed.sidebarFileLinks.shift).toBe(
			DEFAULT_USER_PREFERENCES.sidebarFileLinks.shift,
		);
		expect(healed.sidebarFileLinks.metaShift).toBe(
			DEFAULT_USER_PREFERENCES.sidebarFileLinks.metaShift,
		);
	});

	it("migrates the legacy sidebar file link default to the current default", () => {
		const healed = healUserPreferences({
			sidebarFileLinks: {
				plain: "pane",
				shift: "newTab",
				meta: "external",
				metaShift: "external",
			},
		});

		expect(healed.sidebarFileLinks).toEqual(
			DEFAULT_USER_PREFERENCES.sidebarFileLinks,
		);
	});
});

describe("healWorkspaceLocalState", () => {
	const validPaneLayout: PaneLayout = {
		version: 1,
		tabs: [
			{
				id: "tab-1",
				createdAt: 0,
				activePaneId: "pane-1",
				layout: { type: "pane", paneId: "pane-1" },
				panes: {
					"pane-1": { id: "pane-1", kind: "terminal", data: {} },
				},
			},
		],
		activeTabId: "tab-1",
	};

	const baseStored = {
		workspaceId: "11111111-1111-1111-1111-111111111111",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		paneLayout: validPaneLayout,
		sidebarState: {
			projectId: "22222222-2222-2222-2222-222222222222",
			tabOrder: 3,
			sectionId: null,
			changesFilter: { kind: "all" },
			activeTab: "changes",
			isHidden: false,
		},
		viewedFiles: ["a.ts"],
		recentlyViewedFiles: [],
	};

	it("preserves identity fields and stored values verbatim", () => {
		const healed = healWorkspaceLocalState(baseStored);
		expect(healed.workspaceId).toBe(baseStored.workspaceId);
		expect(healed.createdAt).toBe(baseStored.createdAt);
		// A valid layout survives the read-time heal structurally intact (heal
		// rebuilds the object, so this is structural, not reference, equality).
		expect(healed.paneLayout).toEqual(validPaneLayout);
		expect(healed.sidebarState.projectId).toBe(
			baseStored.sidebarState.projectId,
		);
		expect(healed.sidebarState.tabOrder).toBe(3);
		expect(healed.viewedFiles).toEqual(["a.ts"]);
	});

	it("fills missing top-level optional fields", () => {
		const stored = {
			...baseStored,
			viewedFiles: undefined,
			recentlyViewedFiles: undefined,
			workspaceRunTerminals: undefined,
		};
		const healed = healWorkspaceLocalState(stored);
		expect(healed.viewedFiles).toEqual([]);
		expect(healed.recentlyViewedFiles).toEqual([]);
		expect(healed.workspaceRunTerminals).toEqual({});
	});

	it("drops the retired pending terminal migration payload", () => {
		const healed = healWorkspaceLocalState({
			...baseStored,
			pendingMigratedTerminals: [{ terminalId: "retired-terminal", cwd: null }],
		});
		expect(healed).not.toHaveProperty("pendingMigratedTerminals");
	});

	it("fills missing nested sidebarState fields while preserving projectId", () => {
		// Hypothetical future shape: a sidebarState field was added after this
		// row was written. Identity (projectId) survives; defaults fill in.
		const stored = {
			...baseStored,
			sidebarState: { projectId: baseStored.sidebarState.projectId },
		};
		const healed = healWorkspaceLocalState(stored);
		expect(healed.sidebarState.projectId).toBe(
			baseStored.sidebarState.projectId,
		);
		expect(healed.sidebarState.tabOrder).toBe(0);
		expect(healed.sidebarState.sectionId).toBeNull();
		expect(healed.sidebarState.changesFilter).toEqual({ kind: "all" });
		expect(healed.sidebarState.activeTab).toBe("changes");
		expect(healed.sidebarState.isHidden).toBe(false);
	});

	it("does not throw on null/non-object input (parser must never throw)", () => {
		// Heal must never throw — a throw would take down the entire collection
		// load (loadFromStorage swallows the error and returns an empty Map).
		expect(() => healWorkspaceLocalState(null)).not.toThrow();
		expect(() => healWorkspaceLocalState(undefined)).not.toThrow();
		expect(() => healWorkspaceLocalState("garbage")).not.toThrow();
		expect(() => healWorkspaceLocalState(42)).not.toThrow();
	});

	it("heals a legacy-shaped persisted layout to an empty layout", () => {
		// The pre-binary-tree shape `{ panes, focusedPaneId }` has no `tabs`;
		// left as-is it fed an undefined node to the renderer and white-screened.
		const healed = healWorkspaceLocalState({
			...baseStored,
			paneLayout: { panes: [], focusedPaneId: null },
		});
		expect(healed.paneLayout).toEqual({
			version: 1,
			tabs: [],
			activeTabId: null,
		});
	});
});

describe("sanitizePaneLayout", () => {
	const validTab: PaneLayout["tabs"][number] = {
		id: "tab-1",
		createdAt: 0,
		activePaneId: "pane-1",
		layout: { type: "pane", paneId: "pane-1" },
		panes: { "pane-1": { id: "pane-1", kind: "terminal", data: {} } },
	};

	const EMPTY: PaneLayout = { version: 1, tabs: [], activeTabId: null };

	it("resets non-object / legacy / versionless input to empty", () => {
		expect(sanitizePaneLayout(null)).toEqual(EMPTY);
		expect(sanitizePaneLayout("garbage")).toEqual(EMPTY);
		expect(sanitizePaneLayout({ panes: [], focusedPaneId: null })).toEqual(
			EMPTY,
		);
		expect(sanitizePaneLayout({ version: 1 })).toEqual(EMPTY);
	});

	it("keeps a valid layout intact", () => {
		const layout: PaneLayout = {
			version: 1,
			tabs: [validTab],
			activeTabId: "tab-1",
		};
		expect(sanitizePaneLayout(layout)).toEqual(layout);
	});

	it("keeps a valid split layout intact", () => {
		const layout: PaneLayout = {
			version: 1,
			tabs: [
				{
					...validTab,
					layout: {
						type: "split",
						direction: "horizontal",
						first: { type: "pane", paneId: "pane-1" },
						second: { type: "pane", paneId: "pane-2" },
					},
					panes: {
						"pane-1": { id: "pane-1", kind: "terminal", data: {} },
						"pane-2": { id: "pane-2", kind: "terminal", data: {} },
					},
				},
			],
			activeTabId: "tab-1",
		};
		expect(sanitizePaneLayout(layout)).toEqual(layout);
	});

	it("drops a corrupt tab (split missing a child) but keeps valid tabs", () => {
		const corruptTab = {
			id: "tab-bad",
			createdAt: 0,
			activePaneId: null,
			// split with `second` missing — the exact shape that crashed the
			// renderer by feeding an undefined node to LayoutNodeView.
			layout: {
				type: "split",
				direction: "horizontal",
				first: { type: "pane", paneId: "x" },
			},
			panes: {},
		};
		const result = sanitizePaneLayout({
			version: 1,
			tabs: [corruptTab, validTab],
			activeTabId: "tab-bad",
		});
		expect(result.tabs).toHaveLength(1);
		expect(result.tabs[0]?.id).toBe("tab-1");
		// activeTabId pointed at the dropped tab → repaired to a survivor.
		expect(result.activeTabId).toBe("tab-1");
	});

	it("repairs activeTabId when it points at a dropped/absent tab", () => {
		const result = sanitizePaneLayout({
			version: 1,
			tabs: [validTab],
			activeTabId: "does-not-exist",
		});
		expect(result.activeTabId).toBe("tab-1");
	});
});
