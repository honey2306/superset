import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { ensureHappyDom } from "test-utils/happy-dom-env";

const listQueryMock = mock(async (_input: unknown) => ({
	items: [],
	nextCursor: null,
	enabled: true,
}));
const launchAcpSessionMock = mock(async (_input: unknown) => ({
	sessionId: "session-1",
	state: {},
}));
const createClientMock = mock(() => ({}));
const openPaneMock = mock(() => {});

mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		acpSessions: { list: { query: listQueryMock } },
	}),
}));
mock.module("renderer/lib/acp-session-client", () => ({
	createDesktopAcpSessionClient: createClientMock,
}));
mock.module("renderer/lib/acp-session-launch", () => ({
	// Bun module mocks persist for the full test process. Keep the production
	// catalog intact so this focused launch mock cannot narrow later consumers.
	ACP_SUPPORTED_AGENT_IDS: ["claude", "codex", "pi", "myflicker", "deepseek"],
	isAcpSupportedAgentId: (value: string) =>
		["claude", "codex", "pi", "myflicker", "deepseek"].includes(value),
	launchAcpSession: launchAcpSessionMock,
}));
mock.module("renderer/hooks/useAgentModelPreference", () => ({
	readAgentModelPreference: () => null,
}));
mock.module(
	"renderer/screens/main/components/WorkspaceView/ContentView/hooks/useAcpForAgentPresets",
	() => ({
		useAcpForAgentPresets: () => ({ useAcpForAgentPresets: true }),
	}),
);
mock.module(
	"renderer/screens/main/components/WorkspaceView/ContentView/components/PanesWorkspace/openAcpSessionInPanesStore",
	() => ({
		openAcpSessionInPanesStore: openPaneMock,
	}),
);

let renderHook: typeof import("@testing-library/react/pure").renderHook;
let waitFor: typeof import("@testing-library/react/pure").waitFor;
let useAcpPresetLauncher: typeof import("./useAcpPresetLauncher").useAcpPresetLauncher;

beforeAll(async () => {
	await ensureHappyDom();
	({ renderHook, waitFor } = await import("@testing-library/react/pure"));
	({ useAcpPresetLauncher } = await import("./useAcpPresetLauncher"));
});

beforeEach(() => {
	listQueryMock.mockClear();
	listQueryMock.mockImplementation(async (_input: unknown) => ({
		items: [],
		nextCursor: null,
		enabled: true,
	}));
	launchAcpSessionMock.mockClear();
	createClientMock.mockClear();
	openPaneMock.mockClear();
});

const store = {} as Parameters<typeof useAcpPresetLauncher>[0]["store"];

describe("useAcpPresetLauncher", () => {
	test("only the active kept-alive workspace can launch an ACP preset", async () => {
		const { result } = renderHook(() => [
			useAcpPresetLauncher({
				store,
				hostUrl: "http://host-service",
				hostWorkspaceId: "workspace-active",
				isWorkspaceActive: true,
			}),
			useAcpPresetLauncher({
				store,
				hostUrl: "http://host-service",
				hostWorkspaceId: "workspace-background",
				isWorkspaceActive: false,
			}),
		]);

		await waitFor(() => expect(result.current[0]).toBeDefined());
		expect(result.current[1]).toBeUndefined();
		expect(listQueryMock).toHaveBeenCalledTimes(1);

		expect(await result.current[0]?.launchByPresetName("claude")).toBe(true);
		expect(launchAcpSessionMock).toHaveBeenCalledWith(
			expect.objectContaining({ workspaceId: "workspace-active" }),
		);
		expect(launchAcpSessionMock).not.toHaveBeenCalledWith(
			expect.objectContaining({ workspaceId: "workspace-background" }),
		);
	});

	test("waits for pending ACP detection instead of falling through to Terminal", async () => {
		let resolveDetection:
			| ((value: { items: []; nextCursor: null; enabled: true }) => void)
			| undefined;
		listQueryMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveDetection = resolve;
				}),
		);

		const { result } = renderHook(() =>
			useAcpPresetLauncher({
				store,
				hostUrl: "http://host-service",
				hostWorkspaceId: "workspace-active",
				isWorkspaceActive: true,
			}),
		);

		// The launcher must be available while capability detection is pending;
		// otherwise openPanesPreset immediately falls through to Terminal.
		expect(result.current).toBeDefined();
		const launch = result.current?.launchByPresetName("pi");
		expect(launchAcpSessionMock).not.toHaveBeenCalled();
		expect(listQueryMock).toHaveBeenCalledTimes(1);

		resolveDetection?.({ items: [], nextCursor: null, enabled: true });
		expect(await launch).toBe(true);
		expect(launchAcpSessionMock).toHaveBeenCalledWith(
			expect.objectContaining({
				agentDefinitionId: "pi",
				workspaceId: "workspace-active",
			}),
		);
		expect(listQueryMock).toHaveBeenCalledTimes(1);
	});
});
