import { describe, expect, test } from "bun:test";
import { createWorkspaceStore, type RendererContext } from "@superset/panes";
import {
	acpSessionStatusToPaneStatus,
	createPanesTerminalPaneBridge,
	getPanesTabStatus,
	syncPanesAcpStatuses,
	syncPanesTerminalStatuses,
} from "./createPanesTerminalPaneBridge";
import type { PanesPaneData } from "./types";

function makeContext(): RendererContext<PanesPaneData> {
	const store = createWorkspaceStore<PanesPaneData>();
	store.getState().addTab({
		id: "tab-1",
		panes: [
			{
				id: "pane-1",
				kind: "terminal",
				data: {
					terminalId: "terminal-1",
					initialCommand: "codex",
					initialCwd: "/repo",
					workspaceRun: {
						workspaceId: "workspace-1",
						state: "running",
					},
				},
			},
		],
	});
	const pane = store.getState().getPane("pane-1")?.pane;
	const tab = store.getState().getTab("tab-1");
	if (!pane || !tab) throw new Error("fixture setup failed");

	return {
		pane: { ...pane, parentDirection: null },
		tab: { ...tab, position: 0 },
		isActive: true,
		store,
		actions: {
			close: () => {},
			focus: () => {},
			setTitle: () => {},
			pin: () => {},
			updateData: () => {},
			split: () => {},
		},
		components: { PaneHeaderActions: () => null },
	};
}

describe("createPanesTerminalPaneBridge", () => {
	test("routes terminal state writes to the panes store", () => {
		const context = makeContext();
		const bridge = createPanesTerminalPaneBridge(context);

		bridge.setTitle("Codex");
		bridge.setStatus("working");
		bridge.setCwd("/repo/apps/desktop", true);
		bridge.setWorkspaceRunState("stopped-by-exit");
		bridge.setLifecycleScript({
			kind: "setup",
			state: "succeeded",
			exitCode: 0,
		});
		bridge.clearInitialData();

		const pane = context.store.getState().getPane("pane-1")?.pane;
		expect(pane?.titleOverride).toBe("Codex");
		expect(pane?.data).toMatchObject({
			terminalId: "terminal-1",
			status: "working",
			cwd: "/repo/apps/desktop",
			cwdConfirmed: true,
			workspaceRun: {
				workspaceId: "workspace-1",
				state: "stopped-by-exit",
			},
			lifecycleScript: {
				kind: "setup",
				state: "succeeded",
				exitCode: 0,
			},
		});
		expect(pane?.data.initialCommand).toBeUndefined();
		expect(pane?.data.initialCwd).toBeUndefined();
	});

	test("reports destruction and closes the panes-store pane", () => {
		const context = makeContext();
		const bridge = createPanesTerminalPaneBridge(context);

		expect(bridge.isDestroyed()).toBe(false);
		bridge.close();
		expect(bridge.isDestroyed()).toBe(true);
	});

	test("syncs terminal statuses across inactive tabs without replacing pane data", () => {
		const context = makeContext();
		context.store.getState().addTab({
			id: "tab-2",
			panes: [
				{
					id: "pane-2",
					kind: "terminal",
					data: {
						terminalId: "terminal-2",
						initialCommand: "claude",
						initialCwd: "/other",
					},
				},
			],
		});
		context.store.getState().setActiveTab("tab-1");
		let updates = 0;
		const unsubscribe = context.store.subscribe(() => {
			updates += 1;
		});

		syncPanesTerminalStatuses(
			context.store,
			new Map([
				["terminal-1", "working"],
				["terminal-2", "permission"],
			]),
		);

		expect(context.store.getState().getPane("pane-1")?.pane.data).toMatchObject(
			{
				terminalId: "terminal-1",
				initialCommand: "codex",
				initialCwd: "/repo",
				status: "working",
			},
		);
		expect(context.store.getState().getPane("pane-2")?.pane.data).toMatchObject(
			{
				terminalId: "terminal-2",
				initialCommand: "claude",
				initialCwd: "/other",
				status: "permission",
			},
		);
		expect(updates).toBe(2);

		syncPanesTerminalStatuses(
			context.store,
			new Map([
				["terminal-1", "working"],
				["terminal-2", "permission"],
			]),
		);
		expect(updates).toBe(2);
		unsubscribe();
	});

	test("aggregates the highest terminal pane status for a tab", () => {
		const context = makeContext();
		const tab = context.store.getState().getTab("tab-1");
		if (!tab) throw new Error("fixture setup failed");
		tab.panes["pane-2"] = {
			id: "pane-2",
			kind: "terminal",
			data: { terminalId: "terminal-2", status: "failed" },
		};
		tab.panes["pane-3"] = {
			id: "pane-3",
			kind: "terminal",
			data: { terminalId: "terminal-3", status: "permission" },
		};

		expect(getPanesTabStatus(tab)).toBe("permission");
		tab.panes["pane-3"].data.status = "idle";
		expect(getPanesTabStatus(tab)).toBe("failed");
		tab.panes["pane-2"].data.status = "idle";
		expect(getPanesTabStatus(tab)).toBeNull();
	});

	test("aggregates ACP session states with terminal pane states", () => {
		const context = makeContext();
		const tab = context.store.getState().getTab("tab-1");
		if (!tab) throw new Error("fixture setup failed");
		tab.panes.acp = {
			id: "acp",
			kind: "acp",
			data: {
				acp: {
					sessionId: "session-1",
					agentDefinitionId: "codex",
					status: "awaiting_permission",
				},
			},
		};

		expect(getPanesTabStatus(tab)).toBe("permission");
	});

	test("maps ACP session lifecycle statuses to visual pane statuses", () => {
		expect(acpSessionStatusToPaneStatus("running")).toBe("working");
		expect(acpSessionStatusToPaneStatus("awaiting_permission")).toBe(
			"permission",
		);
		expect(acpSessionStatusToPaneStatus("dead")).toBe("failed");
		expect(acpSessionStatusToPaneStatus("offline")).toBe("idle");
		expect(acpSessionStatusToPaneStatus("idle")).toBe("idle");
	});

	test("syncs ACP session statuses into inactive acp panes", () => {
		const context = makeContext();
		context.store.getState().addTab({
			id: "tab-2",
			panes: [
				{
					id: "acp-pane",
					kind: "acp",
					data: {
						acp: {
							sessionId: "session-a",
							agentDefinitionId: "codex",
							status: "running",
						},
					},
				},
			],
		});

		syncPanesAcpStatuses(
			context.store,
			new Map([["session-a", "awaiting_permission"]]),
		);

		const acpData = context.store.getState().getPane("acp-pane")?.pane.data.acp;
		expect(acpData?.status).toBe("awaiting_permission");

		// Missing session in the map is a no-op (host may not have reported yet).
		syncPanesAcpStatuses(context.store, new Map());
		expect(
			context.store.getState().getPane("acp-pane")?.pane.data.acp?.status,
		).toBe("awaiting_permission");
	});
});
