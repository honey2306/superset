import { describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { AcpTerminalOpenRequestedPayload } from "@superset/workspace-client";
import {
	MAX_HANDLED_ACP_SESSION_OPEN_REQUESTS,
	openTerminalFromAcpRequest,
	shouldHandleAcpSessionOpenRequest,
} from "./useAcpSessionOpenRequests";

describe("shouldHandleAcpSessionOpenRequest", () => {
	test("dedupes transport retries but accepts a later request for the same session", () => {
		const handled = new Set<string>();
		const first = {
			sessionId: "session-1",
			requestId: "request-1",
			occurredAt: 1,
		};

		expect(shouldHandleAcpSessionOpenRequest(handled, first)).toBe(true);
		expect(
			shouldHandleAcpSessionOpenRequest(handled, {
				...first,
				occurredAt: 2,
			}),
		).toBe(false);
		expect(
			shouldHandleAcpSessionOpenRequest(handled, {
				sessionId: "session-1",
				requestId: "request-2",
				occurredAt: 3,
			}),
		).toBe(true);
	});

	test("uses timestamp identity for older events without requestId", () => {
		const handled = new Set<string>();
		expect(
			shouldHandleAcpSessionOpenRequest(handled, {
				sessionId: "session-1",
				occurredAt: 10,
			}),
		).toBe(true);
		expect(
			shouldHandleAcpSessionOpenRequest(handled, {
				sessionId: "session-1",
				occurredAt: 10,
			}),
		).toBe(false);
		expect(
			shouldHandleAcpSessionOpenRequest(handled, {
				sessionId: "session-1",
				occurredAt: 11,
			}),
		).toBe(true);
	});

	test("opens an ACP-created terminal as a user-visible tab and reuses it", () => {
		const store = createWorkspaceStore<{ terminalId?: string }>();
		store.getState().addTab({
			id: "existing-tab",
			panes: [{ id: "existing-pane", kind: "terminal", data: {} }],
		});
		const event = {
			terminalId: "terminal-acp",
			sourceSessionId: "session-1",
			requestId: "request-1",
			title: "Agent terminal",
			focus: true,
			occurredAt: 1,
		} satisfies AcpTerminalOpenRequestedPayload;

		openTerminalFromAcpRequest(store, event);
		const created = store
			.getState()
			.tabs.flatMap((tab) => Object.values(tab.panes))
			.find((pane) => pane.data.terminalId === "terminal-acp");
		expect(created?.titleOverride).toBe("Agent terminal");
		expect(store.getState().activeTabId).not.toBe("existing-tab");

		openTerminalFromAcpRequest(store, { ...event, requestId: "request-2" });
		expect(
			store
				.getState()
				.tabs.flatMap((tab) => Object.values(tab.panes))
				.filter((pane) => pane.data.terminalId === "terminal-acp"),
		).toHaveLength(1);
	});

	test("keeps the active tab when a terminal presentation does not request focus", () => {
		const store = createWorkspaceStore<{ terminalId?: string }>();
		store.getState().addTab({
			id: "existing-tab",
			panes: [{ kind: "terminal", data: {} }],
		});
		openTerminalFromAcpRequest(store, {
			terminalId: "terminal-background",
			sourceSessionId: "session-1",
			requestId: "request-background",
			focus: false,
			occurredAt: 1,
		});
		expect(store.getState().activeTabId).toBe("existing-tab");
	});

	test("evicts old request identities to keep the dedupe set bounded", () => {
		const handled = new Set<string>();
		for (
			let index = 0;
			index < MAX_HANDLED_ACP_SESSION_OPEN_REQUESTS;
			index++
		) {
			expect(
				shouldHandleAcpSessionOpenRequest(handled, {
					sessionId: "session-1",
					requestId: `request-${index}`,
					occurredAt: index,
				}),
			).toBe(true);
		}
		expect(handled.size).toBe(MAX_HANDLED_ACP_SESSION_OPEN_REQUESTS);
		expect(
			shouldHandleAcpSessionOpenRequest(handled, {
				sessionId: "session-1",
				requestId: "request-new",
				occurredAt: MAX_HANDLED_ACP_SESSION_OPEN_REQUESTS,
			}),
		).toBe(true);
		expect(handled.size).toBe(MAX_HANDLED_ACP_SESSION_OPEN_REQUESTS);
		expect(
			shouldHandleAcpSessionOpenRequest(handled, {
				sessionId: "session-1",
				requestId: "request-0",
				occurredAt: 0,
			}),
		).toBe(true);
	});
});
