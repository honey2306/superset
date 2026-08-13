import { afterEach, describe, expect, test } from "bun:test";
import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import {
	openFileInPanes,
	retargetPanesFileViewerPaths,
	shouldBlockFileClose,
} from "./document";
import { configurePanesPersistence, registerPanesStore } from "./repository";
import type { PanesPaneData } from "./types";

const cleanups: Array<() => void> = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	configurePanesPersistence(null);
});

describe("pane documents", () => {
	test("blocks dirty close until save or discard resolves it", () => {
		expect(shouldBlockFileClose(true)).toBe(true);
		expect(shouldBlockFileClose(false)).toBe(false);
	});

	test("opens and focuses a file in the mounted panes store", () => {
		const store = createWorkspaceStore<PanesPaneData>();
		cleanups.push(registerPanesStore("workspace-a", store));
		const result = openFileInPanes("workspace-a", {
			filePath: "/repo/src/index.ts",
			isPinned: true,
		});
		expect(result.status).toBe("applied");
		if (result.status !== "applied") return;
		const location = store.getState().getPane(result.value);
		expect(location?.pane.kind).toBe("file-viewer");
		expect(location?.pane.data.fileViewer?.filePath).toBe("/repo/src/index.ts");
		expect(store.getState().activeTabId).toBe(location?.tabId ?? null);
	});

	test("retargets persisted file viewers while the workspace is unmounted", () => {
		let persisted: WorkspaceState<PanesPaneData> = {
			version: 1,
			activeTabId: "tab-a",
			tabs: [
				{
					id: "tab-a",
					createdAt: 1,
					activePaneId: "pane-a",
					layout: { type: "pane", paneId: "pane-a" },
					panes: {
						"pane-a": {
							id: "pane-a",
							kind: "file-viewer",
							data: {
								fileViewer: {
									filePath: "/repo/old/file.ts",
									viewMode: "raw",
									isPinned: true,
									diffLayout: "inline",
								},
							},
						},
					},
				},
			],
		};
		configurePanesPersistence((_workspaceId, update) => {
			persisted = update(persisted);
			return true;
		});
		expect(
			retargetPanesFileViewerPaths(
				"workspace-a",
				"/repo/old",
				"/repo/new",
				true,
			),
		).toBe(true);
		expect(persisted.tabs[0].panes["pane-a"].data.fileViewer?.filePath).toBe(
			"/repo/new/file.ts",
		);
	});
});
