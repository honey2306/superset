import { expect, test } from "bun:test";
import type { WorkspaceRef } from "../lib/resolve";
import {
	handleCommand,
	handleSessionsKeys,
	switchProjectWorkspace,
	type TuiState,
} from "./chat";

test("new conversation uses the already selected project instead of asking again", () => {
	const state = {
		view: "sessions",
		buffer: "",
		sessions: [],
		selectedIndex: 0,
		workspace: { id: "w1", projectId: "p1" },
		catalog: { projects: [{ id: "p1", name: "selected" }], workspaces: [] },
	} as unknown as TuiState;
	handleSessionsKeys(state, "\r", { name: "return" });
	expect(state.view).toBe("agent-select");
	expect(state.newConversationWorkspace).toBe(state.workspace);
	expect(state.newConversationProject?.id).toBe("p1");
});

test("/projects opens project selection without creating a conversation", async () => {
	const state = {
		view: "conversation",
		active: false,
		buffer: "/projects",
		cursor: 9,
		workspace: { projectId: "p1" },
		catalog: { projects: [{ id: "p1" }, { id: "p2" }], workspaces: [] },
	} as unknown as TuiState;
	await handleCommand(state, "/projects");
	expect(state.view).toBe("project-select");
	expect(state.buffer).toBe("");
	expect(state.projectSelectionMode).toBe("switch");
});

const workspace: WorkspaceRef = {
	id: "w2",
	projectId: "p2",
	name: "target",
	worktreePath: "/tmp/target",
	branch: "main",
	type: "main",
};

test("switch loads target conversations and detaches the old stream without creating a session", async () => {
	let stopped = false;
	let requestedWorkspace: string | undefined;
	const state = {
		active: false,
		sessions: [{ sessionId: "old" }],
		currentIndex: 0,
		workspace: { id: "old" },
		controller: {
			stop: () => {
				stopped = true;
			},
		},
		attachedSessionId: "old",
		streamingText: "old reply",
		hasOpenedConversation: true,
		connection: {
			client: {
				acpSessions: {
					list: {
						query: async (input: { workspaceId: string }) => {
							requestedWorkspace = input.workspaceId;
							return { items: [], nextCursor: null };
						},
					},
				},
			},
		},
	} as unknown as TuiState;
	await switchProjectWorkspace(state, workspace);
	expect(requestedWorkspace).toBe("w2");
	expect(stopped).toBe(true);
	expect(state.workspace).toBe(workspace);
	expect(state.sessions).toEqual([]);
	expect(state.view).toBe("sessions");
	expect(state.controller).toBeUndefined();
	expect(state.attachedSessionId).toBeUndefined();
	expect(state.streamingText).toBe("");
	expect(state.hasOpenedConversation).toBe(false);
});

test("a failed project switch preserves the old workspace and subscription", async () => {
	let stopped = false;
	const state = {
		active: false,
		sessions: [],
		currentIndex: 0,
		workspace: { id: "old" },
		controller: {
			stop: () => {
				stopped = true;
			},
		},
		connection: {
			client: {
				acpSessions: {
					list: {
						query: async () => {
							throw new Error("offline");
						},
					},
				},
			},
		},
	} as unknown as TuiState;
	await expect(switchProjectWorkspace(state, workspace)).rejects.toThrow(
		"offline",
	);
	expect(stopped).toBe(false);
	expect(state.workspace.id).toBe("old");
});
