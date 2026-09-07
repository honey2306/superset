import { expect, test } from "bun:test";
import type { SessionScopedState } from "@superset/session-protocol";
import { buildPhoneWorkspaceContents } from "./phoneWorkspaceSnapshot";

function session(sessionId: string, workspaceId: string): SessionScopedState {
	return {
		sessionId,
		epoch: "epoch-1",
		workspaceId,
		harness: "claude-agent-acp",
		status: "idle",
		title: sessionId,
		currentMode: null,
		configOptions: [],
		availableCommands: null,
		pendingPermissions: [],
		queuedPrompts: [],
		cwd: "/tmp",
		lastSeq: 0,
		lastStopReason: null,
		lastCompletedAt: null,
		lastError: null,
		createdAt: 1,
		updatedAt: 2,
	};
}

test("groups one global ACP page into every catalog workspace", () => {
	const first = session("session-1", "workspace-1");
	const second = session("session-2", "workspace-2");
	const contents = buildPhoneWorkspaceContents({
		enabled: true,
		sessions: [first, second],
		workspaceIds: ["workspace-1", "workspace-2", "workspace-3"],
	});

	expect(contents.size).toBe(3);
	expect(contents.get("workspace-1")?.sessions).toEqual([
		{
			sessionId: first.sessionId,
			title: first.title,
			status: first.status,
			updatedAt: first.updatedAt,
		},
	]);
	expect(contents.get("workspace-2")?.sessions).toEqual([
		{
			sessionId: second.sessionId,
			title: second.title,
			status: second.status,
			updatedAt: second.updatedAt,
		},
	]);
	expect(contents.get("workspace-3")).toMatchObject({
		acpEnabled: true,
		sessions: [],
		terminalSessions: [],
		terminalAgents: [],
	});
});

test("marks all workspaces disabled without exposing sessions", () => {
	const contents = buildPhoneWorkspaceContents({
		enabled: false,
		sessions: [session("session-1", "workspace-1")],
		workspaceIds: ["workspace-1"],
	});

	expect(contents.get("workspace-1")).toMatchObject({
		acpEnabled: false,
		sessions: [],
	});
});
