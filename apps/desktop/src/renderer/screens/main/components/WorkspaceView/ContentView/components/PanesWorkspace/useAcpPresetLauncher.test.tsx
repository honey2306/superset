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
	ACP_SUPPORTED_AGENT_IDS: ["claude"],
	isAcpSupportedAgentId: (value: string) => value === "claude",
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

		expect(result.current[0]?.launchByPresetName("claude")).toBe(true);
		expect(launchAcpSessionMock).toHaveBeenCalledWith(
			expect.objectContaining({ workspaceId: "workspace-active" }),
		);
		expect(launchAcpSessionMock).not.toHaveBeenCalledWith(
			expect.objectContaining({ workspaceId: "workspace-background" }),
		);
	});
});
