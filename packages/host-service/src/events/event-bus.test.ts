import { describe, expect, it } from "bun:test";
import type { DetectedPort } from "@superset/port-scanner";
import type { HostDb } from "../db";
import { portManager } from "../ports/port-manager";
import type { WorkspaceFilesystemManager } from "../runtime/filesystem";
import { EventBus } from "./event-bus";
import type { GitWatcher } from "./git-watcher";

function createEventBus(): EventBus {
	return new EventBus({
		db: {} as unknown as HostDb,
		filesystem: {
			resolveWorkspaceRoot: () => "/tmp/missing-workspace",
		} as unknown as WorkspaceFilesystemManager,
		gitWatcher: {
			onChanged: () => () => {},
		} as unknown as GitWatcher,
	});
}

describe("EventBus port events", () => {
	it("broadcasts port changes from the shared port manager and removes listeners on close", () => {
		const eventBus = createEventBus();
		const sentMessages: string[] = [];
		const socket = {
			readyState: 1,
			send(data: string) {
				sentMessages.push(data);
			},
			close() {},
		};
		const port: DetectedPort = {
			port: 5173,
			pid: 123,
			processName: "vite",
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
			detectedAt: 1_700_000_000_000,
			address: "127.0.0.1",
		};

		eventBus.handleOpen(socket);
		eventBus.start();
		eventBus.start();
		portManager.emit("port:add", port);

		expect(sentMessages).toHaveLength(1);
		const message = JSON.parse(sentMessages[0] ?? "{}");
		expect(message).toMatchObject({
			type: "port:changed",
			workspaceId: "workspace-1",
			eventType: "add",
			port,
			label: null,
		});
		expect(typeof message.occurredAt).toBe("number");

		portManager.emit("port:remove", port);
		expect(sentMessages).toHaveLength(2);
		expect(JSON.parse(sentMessages[1] ?? "{}")).toMatchObject({
			type: "port:changed",
			workspaceId: "workspace-1",
			eventType: "remove",
			port,
			label: null,
		});

		eventBus.close();
		portManager.emit("port:add", port);
		expect(sentMessages).toHaveLength(2);
	});
});

describe("EventBus workspace listeners", () => {
	it("notifies internal listeners without letting one failure block the broadcast", () => {
		const eventBus = createEventBus();
		const received: string[] = [];
		const unsubscribe = eventBus.onWorkspaceChanged((event) => {
			received.push(event.workspaceId);
		});
		eventBus.onWorkspaceChanged(() => {
			throw new Error("listener failure");
		});

		const originalError = console.error;
		console.error = () => {};
		try {
			eventBus.broadcastWorkspaceChanged({
				workspaceId: "workspace-1",
				eventType: "created",
				workspace: null,
				occurredAt: Date.now(),
			});
			unsubscribe();
			eventBus.broadcastWorkspaceChanged({
				workspaceId: "workspace-2",
				eventType: "created",
				workspace: null,
				occurredAt: Date.now(),
			});
		} finally {
			console.error = originalError;
		}

		expect(received).toEqual(["workspace-1"]);
	});
});

describe("EventBus merge request presentation", () => {
	it("broadcasts a validated KDev page opening request", () => {
		const eventBus = createEventBus();
		const sentMessages: string[] = [];
		const socket = {
			readyState: 1,
			send(data: string) {
				sentMessages.push(data);
			},
			close() {},
		};
		eventBus.handleOpen(socket);

		eventBus.broadcastAcpMergeRequestOpenRequested({
			workspaceId: "workspace-1",
			sourceSessionId: "session-1",
			provider: "kdev",
			sourceBranch: "feature/a",
			url: "https://kdev.corp.kuaishou.com/git/group/repo/-/create_MR?branchName=feature%2Fa",
			occurredAt: 1,
		});

		expect(JSON.parse(sentMessages[0] ?? "{}")).toEqual({
			type: "acp-session:merge-request-open-requested",
			workspaceId: "workspace-1",
			sourceSessionId: "session-1",
			provider: "kdev",
			sourceBranch: "feature/a",
			url: "https://kdev.corp.kuaishou.com/git/group/repo/-/create_MR?branchName=feature%2Fa",
			occurredAt: 1,
		});
	});
});
