import { expect, test } from "bun:test";
import type { SessionsPage } from "@superset/session-protocol";
import type { HostServiceContext } from "../../../types";
import type { WorkspaceCatalogSnapshot } from "../../../workspace-catalog";
import { workspaceCatalogRouter } from "./workspace-catalog";

const catalogSnapshot: WorkspaceCatalogSnapshot = {
	schemaVersion: 2,
	revision: 7,
	projects: [],
	workspaces: [],
	health: { unresolvedIdentityConflicts: 0 },
};

function createCaller({
	enabled = true,
	list = async () => ({ items: [], nextCursor: null, enabled }),
}: {
	enabled?: boolean;
	list?: (input: { limit?: number }) => Promise<SessionsPage>;
} = {}) {
	return workspaceCatalogRouter.createCaller({
		catalog: { snapshot: () => catalogSnapshot },
		runtime: {
			acpSessionsEnabled: enabled,
			acpSessions: { list },
		},
		isAuthenticated: true,
	} as unknown as HostServiceContext);
}

test("phoneSnapshot combines one catalog read with one global ACP page", async () => {
	const calls: Array<{ limit?: number }> = [];
	const session = {
		sessionId: "session-1",
		epoch: "epoch-1",
		workspaceId: "workspace-1",
		harness: "claude-agent-acp" as const,
		status: "idle" as const,
		title: "Recent",
		currentMode: null,
		configOptions: [],
		availableCommands: null,
		pendingPermissions: [],
		queuedPrompts: [],
		cwd: "/tmp/workspace-1",
		lastSeq: 0,
		lastStopReason: null,
		lastCompletedAt: null,
		lastError: null,
		createdAt: 10,
		updatedAt: 20,
	};
	const caller = createCaller({
		list: async (input) => {
			calls.push(input);
			return { items: [session], nextCursor: null, enabled: true };
		},
	});

	await expect(caller.phoneSnapshot()).resolves.toEqual({
		catalog: catalogSnapshot,
		acp: { items: [session], nextCursor: null, enabled: true },
	});
	expect(calls).toEqual([{ limit: 200 }]);
});

test("phoneSnapshot reports disabled ACP without touching the session runtime", async () => {
	let listCalls = 0;
	const caller = createCaller({
		enabled: false,
		list: async () => {
			listCalls += 1;
			return { items: [], nextCursor: null, enabled: true };
		},
	});

	await expect(caller.phoneSnapshot()).resolves.toEqual({
		catalog: catalogSnapshot,
		acp: { items: [], nextCursor: null, enabled: false },
	});
	expect(listCalls).toBe(0);
});
