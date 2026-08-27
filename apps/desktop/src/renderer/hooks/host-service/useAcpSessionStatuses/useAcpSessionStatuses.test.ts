import { describe, expect, test } from "bun:test";
import type {
	SessionScopedState,
	SessionsPage,
} from "@superset/session-protocol";
import type { AcpSessionChangedPayload } from "@superset/workspace-client";
import { patchAcpSessionStatusCache } from "./useAcpSessionStatuses";

function session(
	sessionId: string,
	status: SessionScopedState["status"] = "idle",
): SessionScopedState {
	return {
		sessionId,
		epoch: `epoch-${sessionId}`,
		workspaceId: "workspace-1",
		harness: "claude-agent-acp",
		status,
		title: sessionId,
		currentMode: null,
		configOptions: [],
		availableCommands: null,
		pendingPermissions: [],
		queuedPrompts: [],
		cwd: "/workspace",
		lastSeq: 0,
		lastStopReason: null,
		lastCompletedAt: null,
		lastError: null,
		createdAt: 1,
		updatedAt: 1,
	};
}

function changed(
	partial: Partial<AcpSessionChangedPayload> = {},
): AcpSessionChangedPayload {
	return {
		sessionId: "session-1",
		eventType: "changed",
		status: "running",
		occurredAt: 2,
		...partial,
	};
}

describe("patchAcpSessionStatusCache", () => {
	test("patches the matching row immediately without changing other fields", () => {
		const page: SessionsPage = {
			items: [session("session-1"), session("session-2", "running")],
			nextCursor: null,
			enabled: true,
		};

		const patched = patchAcpSessionStatusCache(page, changed());

		expect(patched).not.toBe(page);
		expect(patched?.items[0]).toMatchObject({
			sessionId: "session-1",
			status: "running",
			title: "session-1",
		});
		expect(patched?.items[1]).toBe(page.items[1]);
		expect(patched?.nextCursor).toBeNull();
	});

	test("leaves missing rows and deletion events for the authoritative refetch", () => {
		const page: SessionsPage = {
			items: [session("session-1")],
			nextCursor: null,
			enabled: true,
		};

		expect(
			patchAcpSessionStatusCache(
				page,
				changed({ sessionId: "missing-session" }),
			),
		).toBe(page);
		expect(
			patchAcpSessionStatusCache(
				page,
				changed({ eventType: "deleted", status: undefined }),
			),
		).toBe(page);
		expect(patchAcpSessionStatusCache(undefined, changed())).toBeUndefined();
	});

	test("ignores a changed event that does not carry a status", () => {
		const page: SessionsPage = {
			items: [session("session-1")],
			nextCursor: null,
			enabled: true,
		};

		expect(
			patchAcpSessionStatusCache(page, changed({ status: undefined })),
		).toBe(page);
	});
});
