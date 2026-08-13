import { describe, expect, it, mock } from "bun:test";
import type { WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/lib/panes/pane-viewer-data";
import { forwardElectronLifecycleFallback } from "./electronLifecycleFallback";

const persistedLayout: WorkspaceState<PaneViewerData> = {
	version: 1,
	activeTabId: "tab-1",
	tabs: [
		{
			id: "tab-1",
			createdAt: 1,
			activePaneId: "pane-1",
			layout: { type: "pane", paneId: "pane-1" },
			panes: {
				"pane-1": {
					id: "pane-1",
					kind: "terminal",
					data: { terminalId: "terminal-1" },
				},
			},
		},
	],
};

describe("forwardElectronLifecycleFallback", () => {
	it("forwards the primary identity and narrow capability unchanged", async () => {
		const mutate = mock(async () => ({ success: true }));
		const result = forwardElectronLifecycleFallback({
			event: {
				eventType: "PendingQuestion",
				workspaceId: "workspace-1",
				terminalId: "terminal-1",
				eventId: "event-1234567890",
				occurredAt: 1234,
				capabilityToken: "capability-token",
			},
			paneLayout: persistedLayout,
			client: { notifications: { hook: { mutate } } },
		});

		await result;
		expect(mutate).toHaveBeenCalledTimes(1);
		expect(mutate).toHaveBeenCalledWith({
			terminalId: "terminal-1",
			eventType: "PermissionRequest",
			eventId: "event-1234567890",
			occurredAt: 1234,
			capabilityToken: "capability-token",
		});
	});

	it("does not forward incomplete legacy events", () => {
		const mutate = mock(async () => ({ success: true }));
		const result = forwardElectronLifecycleFallback({
			event: { eventType: "Stop", workspaceId: "workspace-1" },
			paneLayout: persistedLayout,
			client: { notifications: { hook: { mutate } } },
		});

		expect(result).toBeNull();
		expect(mutate).not.toHaveBeenCalled();
	});
});
