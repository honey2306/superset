import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { SessionScopedState } from "@superset/session-protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import type {
	AcpStatusBar as AcpStatusBarComponent,
	getAcpGitStatusSummary as GetAcpGitStatusSummary,
} from "./AcpStatusBar";

let AcpStatusBar: typeof AcpStatusBarComponent;
let getAcpGitStatusSummary: typeof GetAcpGitStatusSummary;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let render: typeof import("@testing-library/react/pure").render;
let screen: typeof import("@testing-library/react/pure").screen;

beforeAll(async () => {
	await ensureHappyDom();
	({ cleanup, render, screen } = await import("@testing-library/react/pure"));
	({ AcpStatusBar, getAcpGitStatusSummary } = await import("./AcpStatusBar"));
});

afterEach(() => {
	cleanup();
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
	test("summarizes host-service branch status for the ACP workspace", () => {
		expect(
			getAcpGitStatusSummary({
				currentBranch: { name: "feature/acp-status" },
				staged: [{ path: "staged.ts" }],
				unstaged: [{ path: "edited.ts" }, { path: "untracked.ts" }],
			}),
		).toEqual({ branch: "feature/acp-status", dirtyCount: 3 });
	});

	test("normalizes duplicate agent thinking metadata into one control", () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});

		render(
			createElement(
				QueryClientProvider,
				{ client: queryClient },
				createElement(AcpStatusBar, {
					state,
					hostUrl: "",
					usage: null,
					currentMode: {
						currentModeId: "thinking-medium",
						availableModes: [
							{ id: "thinking-low", name: "Thinking: low" },
							{ id: "thinking-medium", name: "Thinking: medium" },
						],
					},
					configOptions: [
						{
							id: "model",
							name: "Model",
							category: "model",
							type: "select",
							currentValue: "gpt-5.6",
							options: [
								{
									value: "gpt-5.6",
									name: "openai-codex/GPT-5.6 Sol (recommended)",
								},
							],
						},
						{
							id: "effort",
							name: "Reasoning effort",
							category: "thought_level",
							type: "select",
							currentValue: "medium",
							options: [{ value: "medium", name: "Thinking: medium" }],
						},
					],
				}),
			),
		);

		expect(screen.queryByText("Thinking: medium")).toBeNull();
		// thinking 段只渲染一次（Brain icon + 值）
		const thinkingSegs = document.querySelectorAll(
			".acp-status-bar__seg--thinking",
		);
		expect(thinkingSegs).toHaveLength(1);
		expect(screen.getByText("medium")).toBeTruthy();
		expect(screen.getByText("GPT-5.6 Sol")).toBeTruthy();
	});

	test("never renders the mode pill, regardless of agent metadata", () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});

		render(
			createElement(
				QueryClientProvider,
				{ client: queryClient },
				createElement(AcpStatusBar, {
					state: {
						...state,
						currentMode: {
							currentModeId: "plan",
							availableModes: [
								{ id: "default", name: "Default" },
								{ id: "plan", name: "Plan" },
							],
						},
					},
					hostUrl: "",
					usage: null,
					currentMode: null,
					configOptions: [
						{
							id: "mode",
							name: "Mode",
							category: "mode",
							type: "select",
							currentValue: "default",
							options: [
								{ value: "default", name: "Default" },
								{ value: "plan", name: "Plan" },
							],
						},
						{
							id: "model",
							name: "Model",
							category: "model",
							type: "select",
							currentValue: "kimi-k3",
							options: [{ value: "kimi-k3", name: "Kimi K3" }],
						},
					],
				}),
			),
		);

		expect(screen.queryByText("Default")).toBeNull();
		expect(screen.queryByText("Plan")).toBeNull();
		expect(screen.getByText("Kimi K3")).toBeTruthy();
	});

	test("tolerates an incomplete git status response", () => {
		expect(getAcpGitStatusSummary({ staged: [], unstaged: [] })).toEqual({
			branch: null,
			dirtyCount: 0,
		});
	});
});
