import { describe, expect, it, mock } from "bun:test";
import type { AppRouter } from "@superset/host-service";
import type { TRPCClient } from "@trpc/client";
import {
	createHostServiceTerminalAdapter,
	resolveHostWorkspaceId,
} from "./host-service-terminal-adapter";

function createMockClient(): {
	client: TRPCClient<AppRouter>;
	calls: { method: string; input: unknown }[];
	createSession: ReturnType<typeof mock>;
	killSession: ReturnType<typeof mock>;
} {
	const calls: { method: string; input: unknown }[] = [];
	const createSession = mock(async (input: unknown) => {
		calls.push({ method: "createSession", input });
		return { ok: true };
	});
	const killSession = mock(async (input: unknown) => {
		calls.push({ method: "killSession", input });
		return { ok: true };
	});
	const client = {
		terminal: {
			createSession: { mutate: createSession },
			killSession: { mutate: killSession },
		},
	} as unknown as TRPCClient<AppRouter>;
	return { client, calls, createSession, killSession };
}

function createMockRuntime() {
	return {
		writeInput: mock(() => {}),
		resize: mock(() => {}),
		detach: mock(() => {}),
		discard: mock(() => {}),
	};
}

describe("host-service-terminal-adapter (Milestone 1)", () => {
	it("resolves a host workspace by exact v1 identity first", async () => {
		const client = {
			workspace: {
				list: {
					query: mock(async () => [
						{
							id: "v1-workspace",
							worktreePath: "/repo",
						},
					]),
				},
			},
		} as unknown as TRPCClient<AppRouter>;

		await expect(
			resolveHostWorkspaceId(client, "v1-workspace", "/other"),
		).resolves.toBe("v1-workspace");
	});

	it("maps a v1 workspace to the host-owned row by worktree path", async () => {
		const client = {
			workspace: {
				list: {
					query: mock(async () => [
						{
							id: "host-workspace",
							worktreePath: "/repo/",
						},
					]),
				},
			},
		} as unknown as TRPCClient<AppRouter>;

		await expect(
			resolveHostWorkspaceId(client, "v1-workspace", "/repo"),
		).resolves.toBe("host-workspace");
	});

	it("returns null when the v1 worktree is not registered with host-service", async () => {
		const client = {
			workspace: {
				list: {
					query: mock(async () => []),
				},
			},
		} as unknown as TRPCClient<AppRouter>;

		await expect(
			resolveHostWorkspaceId(client, "v1-workspace", "/missing"),
		).resolves.toBeNull();
	});

	it("creates a host-service terminal session and maps paneId to terminalId", async () => {
		const { client, calls } = createMockClient();
		const adapter = createHostServiceTerminalAdapter({
			hostUrl: "http://127.0.0.1:9999",
			workspaceId: "ws-1",
			getClient: () => client,
			runtime: createMockRuntime(),
		});

		const terminalId = await adapter.createOrAttach({
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
		});

		expect(terminalId).toBeDefined();
		expect(calls[0]?.method).toBe("createSession");
		expect(calls[0]?.input).toMatchObject({
			workspaceId: "ws-1",
			cwd: "/tmp",
		});
		expect(adapter.getTerminalId("pane-1")).toBe(terminalId);
	});

	it("uses the provided paneId as terminalId for stable identity", async () => {
		const { client } = createMockClient();
		const adapter = createHostServiceTerminalAdapter({
			hostUrl: "http://127.0.0.1:9999",
			workspaceId: "ws-1",
			getClient: () => client,
			runtime: createMockRuntime(),
		});

		const terminalId = await adapter.createOrAttach({
			paneId: "pane-stable",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
		});

		expect(terminalId).toBe("pane-stable");
	});

	it("binds a panes-engine pane to its persisted backend terminalId", async () => {
		const { client, calls } = createMockClient();
		const adapter = createHostServiceTerminalAdapter({
			hostUrl: "http://127.0.0.1:9999",
			workspaceId: "ws-panes",
			getClient: () => client,
			runtime: createMockRuntime(),
		});

		const terminalId = await adapter.createOrAttach({
			paneId: "pane-ui-id",
			tabId: "tab-1",
			terminalId: "terminal-backend-id",
		});

		expect(terminalId).toBe("terminal-backend-id");
		expect(adapter.getTerminalId("pane-ui-id")).toBe("terminal-backend-id");
		expect(calls[0]?.input).toMatchObject({
			terminalId: "terminal-backend-id",
			workspaceId: "ws-panes",
		});
	});

	it("rejects remapping a live pane to a different backend terminal", async () => {
		const { client } = createMockClient();
		const adapter = createHostServiceTerminalAdapter({
			hostUrl: "http://127.0.0.1:9999",
			workspaceId: "ws-remap",
			getClient: () => client,
			runtime: createMockRuntime(),
		});

		await adapter.createOrAttach({
			paneId: "pane-remap",
			tabId: "tab-1",
			terminalId: "terminal-first",
		});

		await expect(
			adapter.createOrAttach({
				paneId: "pane-remap",
				tabId: "tab-1",
				terminalId: "terminal-second",
			}),
		).rejects.toThrow("already bound to terminal terminal-first");
	});

	it("is idempotent: re-attach returns the same terminalId without re-creating", async () => {
		const { client, createSession } = createMockClient();
		const adapter = createHostServiceTerminalAdapter({
			hostUrl: "http://127.0.0.1:9999",
			workspaceId: "ws-1",
			getClient: () => client,
			runtime: createMockRuntime(),
		});

		const first = await adapter.createOrAttach({
			paneId: "pane-2",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
		});
		const second = await adapter.createOrAttach({
			paneId: "pane-2",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
		});

		expect(second).toBe(first);
		expect(createSession).toHaveBeenCalledTimes(1);
	});

	it("deduplicates concurrent create requests for the same pane", async () => {
		const { client, createSession } = createMockClient();
		const adapter = createHostServiceTerminalAdapter({
			hostUrl: "http://127.0.0.1:9999",
			workspaceId: "ws-concurrent",
			getClient: () => client,
			runtime: createMockRuntime(),
		});

		const [first, second] = await Promise.all([
			adapter.createOrAttach({
				paneId: "pane-concurrent",
				tabId: "tab-1",
			}),
			adapter.createOrAttach({
				paneId: "pane-concurrent",
				tabId: "tab-1",
			}),
		]);

		expect(second).toBe(first);
		expect(createSession).toHaveBeenCalledTimes(1);
	});

	it("allows a failed create request to be retried", async () => {
		const { client, createSession } = createMockClient();
		createSession
			.mockRejectedValueOnce(new Error("host unavailable"))
			.mockResolvedValueOnce({ ok: true });
		const adapter = createHostServiceTerminalAdapter({
			hostUrl: "http://127.0.0.1:9999",
			workspaceId: "ws-retry",
			getClient: () => client,
			runtime: createMockRuntime(),
		});

		await expect(
			adapter.createOrAttach({
				paneId: "pane-retry",
				tabId: "tab-1",
			}),
		).rejects.toThrow("host unavailable");

		await expect(
			adapter.createOrAttach({
				paneId: "pane-retry",
				tabId: "tab-1",
			}),
		).resolves.toBe("pane-retry");
		expect(createSession).toHaveBeenCalledTimes(2);
	});

	it("keeps terminal identity stable across adapter remounts", async () => {
		const { client, createSession } = createMockClient();
		const deps = {
			hostUrl: "http://127.0.0.1:9999",
			workspaceId: "ws-remount",
			getClient: () => client,
			runtime: createMockRuntime(),
		};
		const firstAdapter = createHostServiceTerminalAdapter(deps);
		const first = await firstAdapter.createOrAttach({
			paneId: "pane-remount",
			tabId: "tab-1",
		});
		const remountedAdapter = createHostServiceTerminalAdapter(deps);
		const second = await remountedAdapter.createOrAttach({
			paneId: "pane-remount",
			tabId: "tab-1",
		});

		expect(second).toBe(first);
		// A new adapter asks host-service to adopt/confirm the stable session.
		expect(createSession).toHaveBeenCalledTimes(2);
	});

	it("routes write, resize, and detach through the byte-safe runtime", async () => {
		const { client } = createMockClient();
		const runtime = createMockRuntime();
		const adapter = createHostServiceTerminalAdapter({
			hostUrl: "http://127.0.0.1:9999",
			workspaceId: "ws-runtime",
			getClient: () => client,
			runtime,
		});
		await adapter.createOrAttach({
			paneId: "pane-runtime",
			tabId: "tab-1",
		});

		adapter.write("pane-runtime", "你好🙂");
		adapter.resize("pane-runtime", 132, 43);
		adapter.detach("pane-runtime");

		expect(runtime.writeInput).toHaveBeenCalledWith(
			"pane-runtime",
			"你好🙂",
			"pane-runtime",
		);
		expect(runtime.resize).toHaveBeenCalledWith(
			"pane-runtime",
			132,
			43,
			"pane-runtime",
		);
		expect(runtime.detach).toHaveBeenCalledWith("pane-runtime", "pane-runtime");
	});

	it("constructs the WebSocket URL with token and workspace params", async () => {
		const { client } = createMockClient();
		const adapter = createHostServiceTerminalAdapter({
			hostUrl: "http://127.0.0.1:9999",
			workspaceId: "ws-1",
			getWsToken: () => "secret-psk",
			getClient: () => client,
			runtime: createMockRuntime(),
		});

		// Create a session so the paneId→terminalId mapping is populated.
		await adapter.createOrAttach({
			paneId: "pane-3",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
		});

		const url = adapter.getWebsocketUrl("pane-3", "dark");
		expect(url).toContain("ws://127.0.0.1:9999/terminal/pane-3");
		expect(url).toContain("token=secret-psk");
		expect(url).toContain("workspaceId=ws-1");
		expect(url).toContain("themeType=dark");
	});

	it("kills the host-service session and clears the mapping", async () => {
		const { client, killSession } = createMockClient();
		const runtime = createMockRuntime();
		const adapter = createHostServiceTerminalAdapter({
			hostUrl: "http://127.0.0.1:9999",
			workspaceId: "ws-1",
			getClient: () => client,
			runtime,
		});

		await adapter.createOrAttach({
			paneId: "pane-4",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
		});
		const terminalId = adapter.getTerminalId("pane-4");
		expect(terminalId).toBeDefined();

		await adapter.kill("pane-4");

		expect(killSession).toHaveBeenCalledWith({
			terminalId: terminalId,
			workspaceId: "ws-1",
		});
		expect(runtime.discard).toHaveBeenCalledWith(terminalId, "pane-4");
		expect(adapter.getTerminalId("pane-4")).toBeNull();
	});

	it("waits for an in-flight create before killing the session", async () => {
		const { client, createSession, killSession } = createMockClient();
		const runtime = createMockRuntime();
		let finishCreate: (() => void) | undefined;
		createSession.mockImplementation(
			() =>
				new Promise<{ ok: boolean }>((resolve) => {
					finishCreate = () => resolve({ ok: true });
				}),
		);
		const adapter = createHostServiceTerminalAdapter({
			hostUrl: "http://127.0.0.1:9999",
			workspaceId: "ws-close-race",
			getClient: () => client,
			runtime,
		});

		const creating = adapter.createOrAttach({
			paneId: "pane-close-race",
			tabId: "tab-1",
		});
		const killing = adapter.kill("pane-close-race");
		await Promise.resolve();

		expect(killSession).not.toHaveBeenCalled();
		expect(finishCreate).toBeDefined();
		finishCreate?.();
		await Promise.all([creating, killing]);

		expect(killSession).toHaveBeenCalledTimes(1);
		expect(adapter.getTerminalId("pane-close-race")).toBeNull();
	});
});
