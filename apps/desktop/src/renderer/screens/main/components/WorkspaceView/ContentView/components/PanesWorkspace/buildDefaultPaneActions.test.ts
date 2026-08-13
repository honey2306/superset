import { describe, expect, mock, test } from "bun:test";
import type { PaneActionConfig, RendererContext } from "@superset/panes";
import { buildDefaultPaneActions } from "./buildDefaultPaneActions";
import type { PanesPaneData } from "./types";

const createTerminalId = mock(() => Promise.resolve("term-new"));

const DEPS = {
	labels: { split: "Split", close: "" },
	icons: {
		splitRows: "rows",
		splitColumns: "columns",
		close: "x",
	},
	createTerminalId,
};

interface FakeCtx {
	pane: {
		id: string;
		kind: "terminal";
		data: PanesPaneData;
		parentDirection: "horizontal" | "vertical" | null;
	};
	actions: {
		split: ReturnType<typeof mock>;
		close: ReturnType<typeof mock>;
	};
}

function makeCtx(
	parentDirection: "horizontal" | "vertical" | null,
): RendererContext<PanesPaneData> {
	const ctx: FakeCtx = {
		pane: {
			id: "pane-1",
			kind: "terminal",
			data: { terminalId: "term-1" },
			parentDirection,
		},
		actions: { split: mock(), close: mock() },
	};
	return ctx as unknown as RendererContext<PanesPaneData>;
}

// Extract the fake ctx back out of the RendererContext for assertions.
function fakeOf(ctx: RendererContext<PanesPaneData>): FakeCtx {
	return ctx as unknown as FakeCtx;
}

describe("buildDefaultPaneActions", () => {
	test("split action splits a new terminal pane along the longer side (horizontal parent → down)", async () => {
		const actions = buildDefaultPaneActions(DEPS);
		const split = actions.find((a) => a.key === "split") as Extract<
			PaneActionConfig<PanesPaneData>,
			{ key: string }
		>;
		const ctx = makeCtx("horizontal");
		await split.onClick?.(ctx);
		expect(fakeOf(ctx).actions.split).toHaveBeenCalledWith("down", {
			kind: "terminal",
			data: { terminalId: "term-new" },
		});
	});

	test("split action splits right when the parent is vertical", async () => {
		const actions = buildDefaultPaneActions(DEPS);
		const split = actions.find((a) => a.key === "split") as Extract<
			PaneActionConfig<PanesPaneData>,
			{ key: string }
		>;
		const ctx = makeCtx("vertical");
		await split.onClick?.(ctx);
		expect(fakeOf(ctx).actions.split).toHaveBeenCalledWith(
			"right",
			expect.objectContaining({ kind: "terminal" }),
		);
	});

	test("split icon flips with parent direction", () => {
		const actions = buildDefaultPaneActions(DEPS);
		const split = actions.find((a) => a.key === "split") as Extract<
			PaneActionConfig<PanesPaneData>,
			{ key: string }
		>;
		const icon = split.icon as (
			ctx: RendererContext<PanesPaneData>,
		) => React.ReactNode;
		expect(icon(makeCtx("horizontal"))).toBe("rows");
		expect(icon(makeCtx("vertical"))).toBe("columns");
	});

	test("close action calls ctx.actions.close()", () => {
		const actions = buildDefaultPaneActions(DEPS);
		const close = actions.find((a) => a.key === "close") as Extract<
			PaneActionConfig<PanesPaneData>,
			{ key: string }
		>;
		const ctx = makeCtx(null);
		close.onClick?.(ctx);
		expect(fakeOf(ctx).actions.close).toHaveBeenCalledTimes(1);
	});
});
