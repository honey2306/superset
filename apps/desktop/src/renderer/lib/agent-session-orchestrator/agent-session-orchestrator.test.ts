import { describe, expect, it, mock } from "bun:test";
import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import type { AgentLaunchTabsAdapter } from "./types";

const { launchAgentSession, selectAgentLaunchAdapter } = await import(
	"./agent-session-orchestrator"
);

function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function createContext({
	tabs,
	launchCommand,
}: {
	tabs: AgentLaunchTabsAdapter;
	launchCommand?: () => Promise<void>;
}) {
	return {
		source: "command-watcher" as const,
		tabs,
		terminalLauncher: {
			resolve: mock(() => ({
				hostUrl: "http://127.0.0.1:4321",
				workspaceId: "ws-1",
			})),
			create: mock(async () => ({ terminalId: "pane-1" })),
			launchCommand: launchCommand ?? mock(async () => {}),
			write: mock(async () => {}),
			kill: mock(async () => {}),
		},
	};
}

describe("selectAgentLaunchAdapter", () => {
	it("picks terminal adapter for terminal requests", () => {
		const request: AgentLaunchRequest = {
			kind: "terminal",
			workspaceId: "ws-1",
			terminal: { command: "echo hello" },
		};

		expect(selectAgentLaunchAdapter(request)).toBe("terminal");
	});
});

describe("launchAgentSession", () => {
	it("deduplicates concurrent launches with the same idempotency key", async () => {
		const gate = createDeferred();
		const addTerminalTab = mock(() => ({ tabId: "tab-1", paneId: "pane-1" }));
		const tabs: AgentLaunchTabsAdapter = {
			getPane: mock(() => undefined),
			getTab: mock(() => undefined),
			addTerminalTab,
			addTerminalPane: mock(() => "pane-2"),
			removePane: mock(() => {}),
			setTabAutoTitle: mock(() => {}),
		};

		const context = createContext({
			tabs,
			launchCommand: async () => {
				await gate.promise;
			},
		});
		const request: AgentLaunchRequest = {
			kind: "terminal",
			workspaceId: "ws-1",
			idempotencyKey: "idem-concurrent",
			terminal: { command: "echo hello" },
		};

		const first = launchAgentSession(request, context);
		const second = launchAgentSession(request, context);

		gate.resolve();
		const [firstResult, secondResult] = await Promise.all([first, second]);

		expect(addTerminalTab).toHaveBeenCalledTimes(1);
		expect(firstResult.status).toBe("running");
		expect(secondResult.status).toBe("running");
		expect(firstResult.tabId).toBe("tab-1");
		expect(secondResult.tabId).toBe("tab-1");
	});

	it("rolls back pane when terminal launch fails", async () => {
		const removePane = mock(() => {});
		const tabs: AgentLaunchTabsAdapter = {
			getPane: mock(() => undefined),
			getTab: mock(() => undefined),
			addTerminalTab: mock(() => ({ tabId: "tab-2", paneId: "pane-2" })),
			addTerminalPane: mock(() => "pane-3"),
			removePane,
			setTabAutoTitle: mock(() => {}),
		};

		const context = createContext({
			tabs,
			launchCommand: async () => {
				throw new Error("terminal write failed");
			},
		});

		const result = await launchAgentSession(
			{
				kind: "terminal",
				workspaceId: "ws-1",
				terminal: { command: "echo fail" },
			},
			context,
		);

		expect(removePane).toHaveBeenCalledWith("pane-2");
		expect(result.status).toBe("failed");
		expect(result.error).toContain("terminal write failed");
	});
});
