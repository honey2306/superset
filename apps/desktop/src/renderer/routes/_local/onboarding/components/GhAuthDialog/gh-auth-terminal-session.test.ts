import { describe, expect, mock, test } from "bun:test";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import {
	buildGhAuthTerminalWsUrl,
	startGhAuthTerminalSession,
} from "./gh-auth-terminal-session";

class FakeWebSocket extends EventTarget {
	binaryType = "blob";
	readonly close = mock(() => {});

	message(data: unknown) {
		this.dispatchEvent(new MessageEvent("message", { data }));
	}
}

function createClient() {
	const create = mock(async () => ({
		terminalId: "transient-123",
		attachmentToken: "capability-secret",
	}));
	const write = mock(async () => ({ success: true as const }));
	const resize = mock(async () => ({ success: true as const }));
	const kill = mock(async () => ({
		terminalId: "transient-123",
		status: "disposed" as const,
	}));
	return {
		client: {
			terminal: {
				transient: {
					create: { mutate: create },
					write: { mutate: write },
					resize: { mutate: resize },
					kill: { mutate: kill },
				},
			},
		} as unknown as HostServiceClient,
		create,
		write,
		resize,
		kill,
	};
}

describe("gh auth host terminal session", () => {
	test("builds an authenticated capability-scoped websocket URL", () => {
		const url = new URL(
			buildGhAuthTerminalWsUrl({
				hostUrl: "http://127.0.0.1:4567",
				terminalId: "transient-123",
				attachmentToken: "cap secret",
				wsAuthToken: "host secret",
			}),
		);
		expect(url.protocol).toBe("ws:");
		expect(url.pathname).toBe("/terminal/transient/transient-123");
		expect(url.searchParams.get("token")).toBe("host secret");
		expect(url.searchParams.get("attachmentToken")).toBe("cap secret");
	});

	test("streams bytes and routes input, resize, exit, and cleanup through Host", async () => {
		const rpc = createClient();
		const socket = new FakeWebSocket();
		const onData = mock(() => {});
		const onExit = mock(() => {});
		let socketUrl = "";
		const session = await startGhAuthTerminalSession({
			hostUrl: "http://127.0.0.1:4567",
			command: "gh auth login",
			cols: 80,
			rows: 24,
			client: rpc.client,
			wsAuthToken: "host-secret",
			onData,
			onExit,
			createWebSocket: (url) => {
				socketUrl = url;
				return socket as unknown as WebSocket;
			},
		});

		expect(rpc.create).toHaveBeenCalledWith({
			command: "gh auth login",
			cols: 80,
			rows: 24,
		});
		expect(socketUrl).toContain("attachmentToken=capability-secret");
		session.write("y");
		session.resize(100, 40);
		socket.message(new Uint8Array([104, 105]).buffer);
		socket.message(JSON.stringify({ type: "exit", exitCode: 0, signal: 0 }));
		session.write("suppressed after exit");
		await session.kill();

		expect(onData).toHaveBeenCalledTimes(1);
		expect(onExit).toHaveBeenCalledWith(0, 0);
		expect(rpc.write).toHaveBeenCalledWith({
			terminalId: "transient-123",
			attachmentToken: "capability-secret",
			data: "y",
		});
		expect(rpc.write).toHaveBeenCalledTimes(1);
		expect(rpc.resize).toHaveBeenCalledWith({
			terminalId: "transient-123",
			attachmentToken: "capability-secret",
			cols: 100,
			rows: 40,
		});
		expect(rpc.kill).toHaveBeenCalledWith({
			terminalId: "transient-123",
			attachmentToken: "capability-secret",
		});
		expect(socket.close).toHaveBeenCalledTimes(1);
	});
});
