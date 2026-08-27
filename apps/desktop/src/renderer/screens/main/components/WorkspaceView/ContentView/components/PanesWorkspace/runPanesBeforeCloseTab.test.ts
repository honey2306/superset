import { describe, expect, mock, test } from "bun:test";
import type { PaneDefinition, PaneRegistry, Tab } from "@superset/panes";
import { buildPanesAcpLifecycleRegistry } from "./buildPanesLifecycleRegistry";
import { runPanesBeforeCloseTab } from "./runPanesBeforeCloseTab";
import type { PanesPaneData } from "./types";

function makeTab(
	panes: Array<{ id: string; kind: string; data: PanesPaneData }>,
): Tab<PanesPaneData> {
	const paneMap = Object.fromEntries(panes.map((pane) => [pane.id, pane]));
	return {
		id: "tab-1",
		createdAt: 1,
		activePaneId: panes[0]?.id ?? null,
		layout: panes[0]
			? { type: "pane", paneId: panes[0].id }
			: { type: "pane", paneId: "missing" },
		panes: paneMap,
	};
}

describe("runPanesBeforeCloseTab", () => {
	test("runs an ACP pane guard and closes its host session", async () => {
		const closeSession = mock<(sessionId: string) => Promise<void>>(
			async () => {},
		);
		const registry: PaneRegistry<PanesPaneData> = {
			acp: {
				...buildPanesAcpLifecycleRegistry({ closeSession }),
				renderPane: () => null,
			},
		};
		const tab = makeTab([
			{
				id: "acp-pane",
				kind: "acp",
				data: {
					acp: { sessionId: "session-1", agentDefinitionId: "claude" },
				},
			},
		]);

		expect(await runPanesBeforeCloseTab(tab, registry)).toBe(true);
		expect(closeSession).toHaveBeenCalledWith("session-1");
	});

	test("blocks the tab when a pane guard vetoes close", async () => {
		const closeSession = mock<(sessionId: string) => Promise<void>>(
			async () => {
				throw new Error("host unavailable");
			},
		);
		const onCloseError = mock<(error: unknown) => void>();
		const registry: PaneRegistry<PanesPaneData> = {
			acp: {
				...buildPanesAcpLifecycleRegistry({ closeSession, onCloseError }),
				renderPane: () => null,
			},
		};
		const tab = makeTab([
			{
				id: "acp-pane",
				kind: "acp",
				data: {
					acp: { sessionId: "session-1", agentDefinitionId: "claude" },
				},
			},
		]);

		expect(await runPanesBeforeCloseTab(tab, registry)).toBe(false);
		expect(closeSession).toHaveBeenCalledTimes(1);
		expect(onCloseError).toHaveBeenCalledTimes(1);
	});

	test("checks multiple panes in order and short-circuits after a veto", async () => {
		const calls: string[] = [];
		const registry: PaneRegistry<PanesPaneData> = {
			first: {
				renderPane: () => null,
				onBeforeClose: async () => {
					calls.push("first");
					return true;
				},
			} satisfies PaneDefinition<PanesPaneData>,
			second: {
				renderPane: () => null,
				onBeforeClose: async () => {
					calls.push("second");
					return false;
				},
			} satisfies PaneDefinition<PanesPaneData>,
			third: {
				renderPane: () => null,
				onBeforeClose: async () => {
					calls.push("third");
					return true;
				},
			} satisfies PaneDefinition<PanesPaneData>,
		};
		const tab = makeTab([
			{ id: "pane-1", kind: "first", data: {} },
			{ id: "pane-2", kind: "second", data: {} },
			{ id: "pane-3", kind: "third", data: {} },
		]);

		expect(await runPanesBeforeCloseTab(tab, registry)).toBe(false);
		expect(calls).toEqual(["first", "second"]);
	});
});
