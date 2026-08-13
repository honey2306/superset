import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SessionScopedState } from "@superset/session-protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import type { AcpStatusBar as AcpStatusBarComponent } from "./AcpStatusBar";

const getHostServiceClientByUrl = mock();

mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl,
}));

let AcpStatusBar: typeof AcpStatusBarComponent;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let render: typeof import("@testing-library/react/pure").render;
let screen: typeof import("@testing-library/react/pure").screen;
let waitFor: typeof import("@testing-library/react/pure").waitFor;

beforeAll(async () => {
	await ensureHappyDom();
	({ cleanup, render, screen, waitFor } = await import(
		"@testing-library/react/pure"
	));
	({ AcpStatusBar } = await import("./AcpStatusBar"));
});

afterEach(() => {
	cleanup();
	getHostServiceClientByUrl.mockReset();
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
		const gitGetStatus = mock(async () => ({
			currentBranch: { name: "feature/acp-status", isHead: true },
			staged: [{ path: "staged.ts" }],
			unstaged: [{ path: "edited.ts" }, { path: "untracked.ts" }],
		}));
		getHostServiceClientByUrl.mockReturnValue({
			git: { getStatus: { query: gitGetStatus } },
		});
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});

		render(
			createElement(
				QueryClientProvider,
				{ client: queryClient },
				createElement(AcpStatusBar, {
					state,
					hostUrl: "http://host-service.test",
					usage: null,
					currentMode: null,
					configOptions: null,
					streamStatus: "connected",
				}),
			),
		);

		await waitFor(() => {
			expect(screen.getByText("feature/acp-status")).toBeTruthy();
		});
		expect(screen.getByText("+3")).toBeTruthy();
		expect(getHostServiceClientByUrl).toHaveBeenCalledWith(
			"http://host-service.test",
		);
		expect(gitGetStatus).toHaveBeenCalledWith({
			workspaceId: "host-workspace-1",
			priority: "foreground",
		});
	});
});
