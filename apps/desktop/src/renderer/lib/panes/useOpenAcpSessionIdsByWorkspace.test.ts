import { beforeEach, describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import { act, renderHook } from "@testing-library/react";
import {
	getPanesStore,
	hydratePanesRepository,
	resetPanesRepositoryForTests,
} from "./repository";
import type { PanesPaneData } from "./types";
import {
	getOpenAcpSessionIds,
	useOpenAcpSessionIdsByWorkspace,
} from "./useOpenAcpSessionIdsByWorkspace";

const emptyLayout = { version: 1 as const, tabs: [], activeTabId: null };

beforeEach(() => resetPanesRepositoryForTests());

describe("getOpenAcpSessionIds", () => {
	it("returns only ACP sessions represented by current panes", () => {
		const store = createWorkspaceStore<PanesPaneData>();
		store.getState().addTab({
			id: "tab-1",
			panes: [
				{
					id: "acp-pane",
					kind: "acp",
					data: {
						acp: { sessionId: "session-open", agentDefinitionId: "claude" },
					},
				},
				{
					id: "terminal-pane",
					kind: "terminal",
					data: { terminalId: "terminal-1" },
				},
			],
		});

		expect(getOpenAcpSessionIds(store.getState())).toEqual(["session-open"]);
	});

	it("returns an empty list when the workspace has no pane store", () => {
		expect(getOpenAcpSessionIds(null)).toEqual([]);
	});
});

describe("useOpenAcpSessionIdsByWorkspace", () => {
	it("updates when an ACP pane opens in an existing workspace store", () => {
		hydratePanesRepository([
			{ workspaceId: "workspace-1", paneLayout: emptyLayout },
		]);
		const { result } = renderHook(() =>
			useOpenAcpSessionIdsByWorkspace(["workspace-1"]),
		);
		expect(result.current.get("workspace-1")).toEqual(new Set());

		act(() => {
			getPanesStore("workspace-1")
				?.getState()
				.addTab({
					id: "tab-1",
					panes: [
						{
							id: "acp-pane",
							kind: "acp",
							data: {
								acp: {
									sessionId: "session-open",
									agentDefinitionId: "claude",
								},
							},
						},
					],
				});
		});

		expect(result.current.get("workspace-1")).toEqual(
			new Set(["session-open"]),
		);
	});
});
