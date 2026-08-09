import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
	SessionScopedState,
	SessionsPage,
} from "@superset/session-protocol";

const createMutateMock = mock(async (_input: unknown) => mockState());
const listQueryMock = mock(async (_input: unknown) => mockPage());
const getQueryMock = mock(async (_input: unknown) => mockState());
const getMessagesQueryMock = mock(async (_input: unknown) => ({
	items: [],
	nextCursor: null,
}));
const promptMutateMock = mock(async (_input: unknown) => ({
	accepted: true as const,
}));
const respondToPermissionMutateMock = mock(async (_input: unknown) => ({
	status: "resolved" as const,
}));
const cancelMutateMock = mock(async (_input: unknown) => undefined);
const closeMutateMock = mock(async (_input: unknown) => undefined);
const setModeMutateMock = mock(async (_input: unknown) => undefined);
const setConfigOptionMutateMock = mock(async (_input: unknown) => undefined);
const searchFilesQueryMock = mock(async (_input: unknown) => ({ matches: [] }));
const listDirectoryQueryMock = mock(async (_input: unknown) => ({
	entries: [],
}));

let currentToken: string | null = "test-token";

mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: (_url: string) => ({
		acpSessions: {
			create: { mutate: createMutateMock },
			list: { query: listQueryMock },
			get: { query: getQueryMock },
			getMessages: { query: getMessagesQueryMock },
			prompt: { mutate: promptMutateMock },
			respondToPermission: { mutate: respondToPermissionMutateMock },
			cancel: { mutate: cancelMutateMock },
			close: { mutate: closeMutateMock },
			setMode: { mutate: setModeMutateMock },
			setConfigOption: { mutate: setConfigOptionMutateMock },
		},
		filesystem: {
			searchFiles: { query: searchFilesQueryMock },
			listDirectory: { query: listDirectoryQueryMock },
		},
	}),
}));

mock.module("renderer/lib/host-service-auth", () => ({
	getHostServiceWsToken: (_url: string) => currentToken,
}));

const { createDesktopAcpSessionClient } = await import("./acp-session-client");

function mockState(): SessionScopedState {
	return {
		sessionId: "session-abc",
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

function mockPage(): SessionsPage {
	return { items: [], nextCursor: null, enabled: true };
}

describe("createDesktopAcpSessionClient", () => {
	beforeEach(() => {
		createMutateMock.mockClear();
		listQueryMock.mockClear();
		getQueryMock.mockClear();
		getMessagesQueryMock.mockClear();
		promptMutateMock.mockClear();
		respondToPermissionMutateMock.mockClear();
		cancelMutateMock.mockClear();
		setModeMutateMock.mockClear();
		setConfigOptionMutateMock.mockClear();
		searchFilesQueryMock.mockClear();
		listDirectoryQueryMock.mockClear();
		currentToken = "test-token";
	});

	describe("create", () => {
		test("delegates to acpSessions.create.mutate", async () => {
			const client = createDesktopAcpSessionClient("http://localhost:3000");
			const input = {
				sessionId: "s-1",
				workspaceId: "ws-1",
				harness: "codex-app-server" as const,
			};
			await client.create(input);
			expect(createMutateMock).toHaveBeenCalledWith(input);
			expect(createMutateMock).toHaveBeenCalledTimes(1);
		});
	});

	describe("list", () => {
		test("delegates to acpSessions.list.query", async () => {
			const client = createDesktopAcpSessionClient("http://localhost:3000");
			const input = { workspaceId: "ws-1", limit: 10 };
			await client.list(input);
			expect(listQueryMock).toHaveBeenCalledWith(input);
			expect(listQueryMock).toHaveBeenCalledTimes(1);
		});
	});

	describe("api.get", () => {
		test("delegates to acpSessions.get.query", async () => {
			const client = createDesktopAcpSessionClient("http://localhost:3000");
			await client.api.get({ sessionId: "s-1" });
			expect(getQueryMock).toHaveBeenCalledWith({ sessionId: "s-1" });
		});
	});

	describe("api.getMessages", () => {
		test("delegates to acpSessions.getMessages.query", async () => {
			const client = createDesktopAcpSessionClient("http://localhost:3000");
			await client.api.getMessages({ sessionId: "s-1", limit: 50 });
			expect(getMessagesQueryMock).toHaveBeenCalledWith({
				sessionId: "s-1",
				limit: 50,
			});
		});
	});

	describe("api.prompt", () => {
		test("delegates to acpSessions.prompt.mutate", async () => {
			const client = createDesktopAcpSessionClient("http://localhost:3000");
			const input = {
				sessionId: "s-1",
				prompt: [{ type: "text" as const, text: "hello" }],
			};
			await client.api.prompt(input);
			expect(promptMutateMock).toHaveBeenCalledWith(input);
		});
	});

	describe("api.respondToPermission", () => {
		test("delegates to acpSessions.respondToPermission.mutate", async () => {
			const client = createDesktopAcpSessionClient("http://localhost:3000");
			const input = {
				sessionId: "s-1",
				requestId: "req-1",
				outcome: { outcome: "cancelled" as const },
			};
			await client.api.respondToPermission(input);
			expect(respondToPermissionMutateMock).toHaveBeenCalledWith(input);
		});
	});

	describe("api.cancel", () => {
		test("delegates to acpSessions.cancel.mutate", async () => {
			const client = createDesktopAcpSessionClient("http://localhost:3000");
			await client.api.cancel({ sessionId: "s-1" });
			expect(cancelMutateMock).toHaveBeenCalledWith({ sessionId: "s-1" });
		});
	});

	describe("api.close", () => {
		test("delegates to acpSessions.close.mutate", async () => {
			const client = createDesktopAcpSessionClient("http://localhost:3000");
			await client.api.close({ sessionId: "s-1" });
			expect(closeMutateMock).toHaveBeenCalledWith({ sessionId: "s-1" });
		});
	});

	describe("api.setMode", () => {
		test("delegates to acpSessions.setMode.mutate", async () => {
			const client = createDesktopAcpSessionClient("http://localhost:3000");
			await client.api.setMode({ sessionId: "s-1", modeId: "plan" });
			expect(setModeMutateMock).toHaveBeenCalledWith({
				sessionId: "s-1",
				modeId: "plan",
			});
		});
	});

	describe("api.setConfigOption", () => {
		test("delegates to acpSessions.setConfigOption.mutate", async () => {
			const client = createDesktopAcpSessionClient("http://localhost:3000");
			await client.api.setConfigOption({
				sessionId: "s-1",
				configId: "model",
				value: "sonnet",
			});
			expect(setConfigOptionMutateMock).toHaveBeenCalledWith({
				sessionId: "s-1",
				configId: "model",
				value: "sonnet",
			});
		});
	});

	describe("streamUrl", () => {
		test("converts http to ws and includes session id in path", () => {
			const client = createDesktopAcpSessionClient("http://localhost:3000");
			const factory = client.streamUrl("session-abc");
			const url = factory();
			expect(url).toContain("ws://localhost:3000");
			expect(url).toContain("/acp-sessions/session-abc/stream");
		});

		test("converts https to wss", () => {
			const client = createDesktopAcpSessionClient("https://relay.example.com");
			const factory = client.streamUrl("session-abc");
			const url = factory();
			expect(url).toContain("wss://relay.example.com");
		});

		test("encodes special characters in session id", () => {
			const client = createDesktopAcpSessionClient("http://localhost:3000");
			const factory = client.streamUrl("session/with spaces");
			const url = factory();
			expect(url).not.toContain("session/with spaces");
			expect(url).toContain(encodeURIComponent("session/with spaces"));
		});

		test("includes token as query param when token exists", () => {
			currentToken = "my-secret-token";
			const client = createDesktopAcpSessionClient("http://localhost:3000");
			const factory = client.streamUrl("s-1");
			const url = factory();
			expect(url).toContain("token=my-secret-token");
		});

		test("omits token query param when token is null", () => {
			currentToken = null;
			const client = createDesktopAcpSessionClient("http://localhost:3000");
			const factory = client.streamUrl("s-1");
			const url = factory();
			expect(url).not.toContain("token=");
		});

		test("re-reads token on each factory invocation for reconnect", () => {
			currentToken = "initial-token";
			const client = createDesktopAcpSessionClient("http://localhost:3000");
			const factory = client.streamUrl("s-1");
			const url1 = factory();
			expect(url1).toContain("token=initial-token");

			currentToken = "rotated-token";
			const url2 = factory();
			expect(url2).toContain("token=rotated-token");
		});
	});

	test("uses host filesystem search for a non-empty file suggestion", async () => {
		const client = createDesktopAcpSessionClient("http://localhost:3000");
		await client.searchFiles?.({
			workspaceId: "ws-1",
			cwd: "/repo",
			query: "package",
		});
		expect(searchFilesQueryMock).toHaveBeenCalledWith({
			workspaceId: "ws-1",
			query: "package",
			includeHidden: false,
			limit: 20,
		});
	});

	test("uses host directory listing for the empty file suggestion", async () => {
		const client = createDesktopAcpSessionClient("http://localhost:3000");
		await client.searchFiles?.({
			workspaceId: "ws-1",
			cwd: "/repo",
			query: "",
		});
		expect(listDirectoryQueryMock).toHaveBeenCalledWith({
			workspaceId: "ws-1",
			absolutePath: "/repo",
		});
	});
});
