import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SessionScopedState } from "@superset/session-protocol";
import { createElement } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import type { AcpStatusBar as AcpStatusBarComponent } from "./AcpStatusBar";

const getHostServiceClientByUrl = mock();
const useQuery = mock();

mock.module("@tanstack/react-query", () => ({ useQuery }));
mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl,
}));

let AcpStatusBar: typeof AcpStatusBarComponent;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let render: typeof import("@testing-library/react/pure").render;
let screen: typeof import("@testing-library/react/pure").screen;

beforeAll(async () => {
	await ensureHappyDom();
	({ cleanup, render, screen } = await import("@testing-library/react/pure"));
	({ AcpStatusBar } = await import("./AcpStatusBar"));
});

afterEach(() => {
	cleanup();
	getHostServiceClientByUrl.mockReset();
	useQuery.mockReset();
});

const state: SessionScopedState = {
	sessionId: "session-1",
	epoch: "epoch-1",
	workspaceId: "host-workspace-1",
	harness: "claude-agent-acp",
	status: "idle",
	title: null,
	currentMode: null,
	configOptions: [],
	availableCommands: null,
	pendingPermissions: [],
	queuedPrompts: [],
	cwd: "/not-used-by-host-service",
	lastSeq: 0,
	lastStopReason: null,
	lastError: null,
	createdAt: 0,
	updatedAt: 0,
};

describe("AcpStatusBar", () => {
	test("shows host-service branch status for the ACP workspace", async () => {
		const gitGetStatus = mock(async () => ({ branch: "from-host-service" }));
		getHostServiceClientByUrl.mockReturnValue({
			git: { getStatus: { query: gitGetStatus } },
		});
		useQuery.mockReturnValue({
			data: {
				currentBranch: { name: "feature/acp-status", isHead: true },
				staged: [{ path: "staged.ts" }],
				unstaged: [{ path: "edited.ts" }, { path: "untracked.ts" }],
			},
		});

		render(
			createElement(AcpStatusBar, {
				state,
				hostUrl: "http://host-service.test",
				usage: null,
				currentMode: null,
				configOptions: null,
				streamStatus: "connected",
			}),
		);

		expect(screen.getByText("feature/acp-status")).toBeTruthy();
		expect(screen.getByText("+3")).toBeTruthy();
		expect(useQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: [
					"acp-git-status",
					"http://host-service.test",
					"host-workspace-1",
				],
			}),
		);

		const options = useQuery.mock.calls[0]?.[0] as {
			queryFn: () => Promise<unknown>;
		};
		await options.queryFn();
		expect(getHostServiceClientByUrl).toHaveBeenCalledWith(
			"http://host-service.test",
		);
		expect(gitGetStatus).toHaveBeenCalledWith({
			workspaceId: "host-workspace-1",
			priority: "foreground",
		});
	});
});
