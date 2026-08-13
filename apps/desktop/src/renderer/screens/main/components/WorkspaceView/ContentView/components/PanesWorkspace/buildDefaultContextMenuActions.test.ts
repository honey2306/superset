import { describe, expect, mock, test } from "bun:test";
import type {
	ContextMenuActionConfig,
	PaneRegistry,
	RendererContext,
} from "@superset/panes";
import { buildDefaultContextMenuActions } from "./buildDefaultContextMenuActions";
import type { PanesPaneData } from "./types";

const createTerminalId = mock(() => Promise.resolve("term-new"));

const DEPS = {
	paneRegistry: {
		terminal: { getTitle: () => "Terminal" },
	} as unknown as PaneRegistry<PanesPaneData>,
	labels: {
		splitDown: "Split Down",
		splitRight: "Split Right",
		equalize: "Equalize",
		moveToTab: "Move to Tab",
		newTab: "New Tab",
		closePane: "Close Pane",
	},
	hotkeys: {
		splitDown: "⌘⇧D",
		splitRight: "⌘D",
		equalize: "⌘⇧0",
		closePane: "⌘W",
	},
	icons: {
		splitDown: "rows",
		splitRight: "columns",
		equalize: "equal",
		move: "move",
		newTab: "plus",
		close: "x",
	},
	createTerminalId,
};

interface FakeCtx {
	pane: { id: string; kind: "terminal"; data: PanesPaneData };
	tab: { id: string };
	store: {
		getState: () => {
			tabs: never[];
			equalizeTab: ReturnType<typeof mock>;
			movePaneToTab: ReturnType<typeof mock>;
			movePaneToNewTab: ReturnType<typeof mock>;
		};
	};
	actions: { split: ReturnType<typeof mock>; close: ReturnType<typeof mock> };
}

function makeCtx(
	paneId: string,
	tabId: string,
): RendererContext<PanesPaneData> {
	const state = {
		tabs: [] as never[],
		equalizeTab: mock(),
		movePaneToTab: mock(),
		movePaneToNewTab: mock(),
	};
	const ctx: FakeCtx = {
		pane: { id: paneId, kind: "terminal", data: { terminalId: "t" } },
		tab: { id: tabId },
		store: { getState: () => state },
		actions: { split: mock(), close: mock() },
	};
	return ctx as unknown as RendererContext<PanesPaneData>;
}

function fakeOf(ctx: RendererContext<PanesPaneData>): FakeCtx {
	return ctx as unknown as FakeCtx;
}

describe("buildDefaultContextMenuActions", () => {
	test("split-down calls ctx.actions.split('down', terminal pane)", async () => {
		const actions = buildDefaultContextMenuActions(
			DEPS,
		) as ContextMenuActionConfig<PanesPaneData>[];
		const splitDown = actions.find((a) => a.key === "split-horizontal");
		const ctx = makeCtx("pane-1", "tab-1");
		await splitDown?.onSelect?.(ctx);
		expect(fakeOf(ctx).actions.split).toHaveBeenCalledWith(
			"down",
			expect.objectContaining({
				kind: "terminal",
				data: { terminalId: "term-new" },
			}),
		);
	});

	test("split-right calls ctx.actions.split('right', terminal pane)", async () => {
		const actions = buildDefaultContextMenuActions(
			DEPS,
		) as ContextMenuActionConfig<PanesPaneData>[];
		const splitRight = actions.find((a) => a.key === "split-vertical");
		const ctx = makeCtx("pane-1", "tab-1");
		await splitRight?.onSelect?.(ctx);
		expect(fakeOf(ctx).actions.split).toHaveBeenCalledWith(
			"right",
			expect.objectContaining({ kind: "terminal" }),
		);
	});

	test("equalize calls store.equalizeTab for the active tab", () => {
		const actions = buildDefaultContextMenuActions(
			DEPS,
		) as ContextMenuActionConfig<PanesPaneData>[];
		const equalize = actions.find((a) => a.key === "equalize-splits");
		const ctx = makeCtx("pane-1", "tab-1");
		equalize?.onSelect?.(ctx);
		expect(fakeOf(ctx).store.getState().equalizeTab).toHaveBeenCalledWith({
			tabId: "tab-1",
		});
	});

	test("close-pane calls ctx.actions.close()", () => {
		const actions = buildDefaultContextMenuActions(
			DEPS,
		) as ContextMenuActionConfig<PanesPaneData>[];
		const close = actions.find((a) => a.key === "close-pane");
		const ctx = makeCtx("pane-1", "tab-1");
		close?.onSelect?.(ctx);
		expect(fakeOf(ctx).actions.close).toHaveBeenCalledTimes(1);
	});
});
