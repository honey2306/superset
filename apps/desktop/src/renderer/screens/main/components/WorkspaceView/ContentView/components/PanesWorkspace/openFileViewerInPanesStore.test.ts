import { describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import { openFileViewerInPanesStore } from "./openFileViewerInPanesStore";
import type { PanesPaneData } from "./types";

describe("openFileViewerInPanesStore", () => {
	test("splits a file viewer beside the active pane", () => {
		const store = createWorkspaceStore<PanesPaneData>();
		store.getState().addTab({
			panes: [{ id: "terminal", kind: "terminal", data: { terminalId: "t" } }],
		});

		const paneId = openFileViewerInPanesStore(store, {
			filePath: "src/app.ts",
		});
		const tab = store.getState().getActiveTab();

		expect(tab?.panes[paneId]).toMatchObject({
			kind: "file-viewer",
			data: { fileViewer: { filePath: "src/app.ts", isPinned: false } },
		});
		expect(Object.keys(tab?.panes ?? {})).toHaveLength(2);
	});

	test("reuses and focuses an existing unpinned matching file viewer", () => {
		const store = createWorkspaceStore<PanesPaneData>();
		store.getState().addTab({
			panes: [
				{
					id: "file",
					kind: "file-viewer",
					data: {
						fileViewer: {
							filePath: "src/app.ts",
							viewMode: "raw",
							isPinned: false,
							diffLayout: "inline",
						},
					},
				},
			],
		});

		const paneId = openFileViewerInPanesStore(store, {
			filePath: "src/app.ts",
			line: 12,
		});

		expect(paneId).toBe("file");
		expect(
			store.getState().getActivePane()?.pane.data.fileViewer,
		).toMatchObject({
			filePath: "src/app.ts",
			initialLine: 12,
		});
	});
});
