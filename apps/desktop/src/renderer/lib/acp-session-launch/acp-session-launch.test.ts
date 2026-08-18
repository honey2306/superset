import { describe, expect, mock, test } from "bun:test";
import type {
	SessionScopedState,
	SessionsPage,
} from "@superset/session-protocol";
import type { DesktopAcpSessionClient } from "../acp-session-client";
import { launchAcpSession } from "./acp-session-launch";

function makeState(sessionId = "s-new"): SessionScopedState {
	return {
		sessionId,
		workspaceId: "ws-1",
		harness: "claude-agent-acp",
		status: "idle",
		title: null,
		currentMode: null,
		configOptions: [],
		availableCommands: null,
		pendingPermissions: [],
		queuedPrompts: [],
		cwd: "/",
		epoch: "epoch-test",
		lastSeq: 0,
		lastStopReason: null,
		lastError: null,
		createdAt: 0,
		updatedAt: 0,
	};
}

function makeClient(
	overrides?: Partial<DesktopAcpSessionClient>,
): DesktopAcpSessionClient {
	return {
		api: {} as DesktopAcpSessionClient["api"],
		create: mock(async (input) => makeState(input.sessionId)),
		list: mock(
			async (_input) =>
				({ items: [], nextCursor: null, enabled: true }) as SessionsPage,
		),
		streamUrl: mock((_id) => () => "ws://localhost/stream"),
		...overrides,
	};
}

describe("launchAcpSession", () => {
	test("opens the predetermined session pane immediately while create is pending", async () => {
		let resolveCreate: ((state: SessionScopedState) => void) | undefined;
		const client = makeClient({
			create: mock(
				(input) =>
					new Promise<SessionScopedState>((resolve) => {
						resolveCreate = () => resolve(makeState(input.sessionId));
					}),
			),
		});
		const openPane = mock((_input: unknown) => {});

		const launch = launchAcpSession({
			workspaceId: "ws-1",
			agentDefinitionId: "claude",
			client,
			openPane,
		});

		expect(openPane).toHaveBeenCalledTimes(1);
		expect(openPane).toHaveBeenCalledWith({
			sessionId: expect.any(String),
			agentDefinitionId: "claude",
			title: null,
			status: "starting",
			isLaunching: true,
		});

		resolveCreate?.(
			makeState(
				(openPane.mock.calls[0]?.[0] as { sessionId: string }).sessionId,
			),
		);
		await launch;
	});

	test("keeps the starting pane and reports creation failure", async () => {
		const client = makeClient({
			create: mock(async () => {
				throw new Error("network error");
			}),
		});
		const openPane = mock((_input: unknown) => {});
		const onSessionCreationFailed = mock((_input: unknown) => {});

		await expect(
			launchAcpSession({
				workspaceId: "ws-1",
				agentDefinitionId: "claude",
				client,
				openPane,
				onSessionCreationFailed,
			}),
		).rejects.toThrow("network error");

		expect(openPane).toHaveBeenCalledWith({
			sessionId: expect.any(String),
			agentDefinitionId: "claude",
			title: null,
			status: "starting",
			isLaunching: true,
		});
		expect(onSessionCreationFailed).toHaveBeenCalledWith({
			sessionId: expect.any(String),
			error: expect.objectContaining({ message: "network error" }),
		});
	});

	test("uses provided sessionId for create (idempotent retry)", async () => {
		const client = makeClient();
		const openPane = mock((_input: unknown) => {});
		const fixedId = "fixed-session-id";

		const result = await launchAcpSession({
			workspaceId: "ws-1",
			agentDefinitionId: "claude",
			client,
			openPane,
			sessionId: fixedId,
		});

		expect(result.sessionId).toBe(fixedId);
		expect(client.create).toHaveBeenCalledWith({
			sessionId: fixedId,
			workspaceId: "ws-1",
			harness: "claude-agent-acp",
		});
	});

	test("generates a UUID when sessionId is not provided", async () => {
		const client = makeClient();
		const openPane = mock((_input: unknown) => {});

		const result = await launchAcpSession({
			workspaceId: "ws-1",
			agentDefinitionId: "claude",
			client,
			openPane,
		});

		expect(typeof result.sessionId).toBe("string");
		expect(result.sessionId.length).toBeGreaterThan(0);
		expect(result.sessionId).not.toBe("");
	});

	test("maps Codex to its app-server harness", async () => {
		const client = makeClient({
			create: mock(async (input) => ({
				...makeState(input.sessionId),
				harness: "codex-app-server" as const,
			})),
		});
		const openPane = mock((_input: unknown) => {});

		await launchAcpSession({
			workspaceId: "ws-1",
			agentDefinitionId: "codex",
			client,
			openPane,
		});

		expect(client.create).toHaveBeenCalledWith({
			sessionId: expect.any(String),
			workspaceId: "ws-1",
			harness: "codex-app-server",
		});
		expect(openPane).toHaveBeenCalledWith({
			sessionId: expect.any(String),
			agentDefinitionId: "codex",
			title: null,
			status: "starting",
			isLaunching: true,
		});
	});

	test.each([
		["pi", "pi-acp"],
		["myflicker", "myflicker-acp"],
		["deepseek", "deepseek-acp"],
	] as const)("maps %s to its ACP harness", async (agentDefinitionId, harness) => {
		const client = makeClient();
		const openPane = mock((_input: unknown) => {});

		await launchAcpSession({
			workspaceId: "ws-1",
			agentDefinitionId,
			client,
			openPane,
		});

		expect(client.create).toHaveBeenCalledWith({
			sessionId: expect.any(String),
			workspaceId: "ws-1",
			harness,
		});
		expect(openPane).toHaveBeenCalledWith({
			sessionId: expect.any(String),
			agentDefinitionId,
			title: null,
			status: "starting",
			isLaunching: true,
		});
	});

	test("rejects unsupported agentDefinitionId before any network call", async () => {
		const client = makeClient();
		const openPane = mock((_input: unknown) => {});

		await expect(
			launchAcpSession({
				workspaceId: "ws-1",
				agentDefinitionId: "amp" as "claude",
				client,
				openPane,
			}),
		).rejects.toThrow(/unsupported/i);

		expect(client.create).not.toHaveBeenCalled();
		expect(openPane).not.toHaveBeenCalled();
	});

	test("openPane receives sessionId and agentDefinitionId but not full state", async () => {
		const client = makeClient();
		const openPane = mock((_input: unknown) => {});

		const result = await launchAcpSession({
			workspaceId: "ws-1",
			agentDefinitionId: "claude",
			client,
			openPane,
		});

		expect(openPane).toHaveBeenCalledTimes(1);
		const openPaneArg = openPane.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(openPaneArg.sessionId).toBe(result.sessionId);
		expect(openPaneArg.agentDefinitionId).toBe("claude");
		expect(openPaneArg).not.toHaveProperty("workspaceId");
		expect(openPaneArg).not.toHaveProperty("configOptions");
		expect(openPaneArg).not.toHaveProperty("pendingPermissions");
	});

	test("returns sessionId and state from create", async () => {
		const expectedState = makeState("created-id");
		const client = makeClient({
			create: mock(async (_input) => expectedState),
		});
		const openPane = mock((_input: unknown) => {});

		const result = await launchAcpSession({
			workspaceId: "ws-1",
			agentDefinitionId: "claude",
			client,
			openPane,
		});

		expect(result.state).toBe(expectedState);
		expect(result.sessionId).toBe("created-id");
	});
});
