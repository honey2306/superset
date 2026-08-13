import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SubscribeCallbacks } from "./DaemonClient/DaemonClient";
import { initTerminalBaseEnv } from "./env";
import {
	type TransientTerminalDaemon,
	TransientTerminalManager,
} from "./transient-terminal";

class FakeDaemon implements TransientTerminalDaemon {
	readonly open = mock(
		async (
			_id: string,
			_meta: Parameters<TransientTerminalDaemon["open"]>[1],
		) => ({ id: "ignored", pid: 123 }),
	);
	readonly input = mock(() => {});
	readonly resize = mock(() => {});
	readonly close = mock(async () => {});
	private callbacks: SubscribeCallbacks | null = null;

	subscribe(
		_id: string,
		_opts: { replay: boolean },
		callbacks: SubscribeCallbacks,
	): () => void {
		this.callbacks = callbacks;
		return () => {
			this.callbacks = null;
		};
	}

	output(data: string) {
		this.callbacks?.onOutput(Buffer.from(data));
	}

	exit(code: number, signal = 0) {
		this.callbacks?.onExit({ code, signal });
	}
}

function fakeSocket() {
	return {
		readyState: 1,
		sent: [] as Array<string | Uint8Array<ArrayBuffer>>,
		send(data: string | Uint8Array<ArrayBuffer>) {
			this.sent.push(data);
		},
		close: mock(() => {}),
	};
}

beforeEach(() => {
	initTerminalBaseEnv({
		HOME: "/tmp",
		PATH: "/usr/bin:/bin",
		SHELL: "/bin/sh",
	});
});

describe("TransientTerminalManager", () => {
	test("creates a command PTY without workspace or database ownership", async () => {
		const daemon = new FakeDaemon();
		const manager = new TransientTerminalManager(async () => daemon);
		const created = await manager.create({
			command: "gh auth login",
			cols: 80,
			rows: 24,
		});

		expect(created.terminalId).toStartWith("transient-");
		expect(created.attachmentToken.length).toBeGreaterThan(20);
		expect(daemon.open).toHaveBeenCalledTimes(1);
		const [, meta] = daemon.open.mock.calls[0] ?? [];
		expect(meta).toMatchObject({
			argv: ["-lc", "gh auth login"],
			cwd: "/tmp",
			cols: 80,
			rows: 24,
		});
		expect(meta).not.toHaveProperty("workspaceId");
	});

	test("requires the per-session capability for control and attachment", async () => {
		const daemon = new FakeDaemon();
		const manager = new TransientTerminalManager(async () => daemon);
		const created = await manager.create({ command: "gh auth login" });

		expect(() => manager.write(created.terminalId, "wrong", "x")).toThrow(
			/token is invalid/,
		);
		expect(() =>
			manager.attach(created.terminalId, "wrong", fakeSocket()),
		).toThrow(/token is invalid/);

		manager.write(created.terminalId, created.attachmentToken, "yes\r");
		manager.resize(created.terminalId, created.attachmentToken, 90, 30);
		expect(daemon.input).toHaveBeenCalledWith(
			created.terminalId,
			Buffer.from("yes\r"),
		);
		expect(daemon.resize).toHaveBeenCalledWith(created.terminalId, 90, 30);
		await manager.kill(created.terminalId, created.attachmentToken);
		expect(daemon.close).toHaveBeenCalledWith(created.terminalId, "SIGHUP");
	});

	test("replays output, streams exit, and kills explicitly", async () => {
		const daemon = new FakeDaemon();
		const manager = new TransientTerminalManager(async () => daemon);
		const created = await manager.create({ command: "gh auth login" });
		daemon.output("before attach");
		const socket = fakeSocket();

		manager.attach(created.terminalId, created.attachmentToken, socket);
		daemon.output("live");
		daemon.exit(7);

		expect(String(socket.sent[0])).toContain('"type":"attached"');
		expect(Buffer.from(socket.sent[1] as Uint8Array).toString()).toBe(
			"before attach",
		);
		expect(Buffer.from(socket.sent[2] as Uint8Array).toString()).toBe("live");
		expect(String(socket.sent[3])).toContain('"exitCode":7');

		await manager.kill(created.terminalId, created.attachmentToken);
		expect(daemon.close).not.toHaveBeenCalled();
		expect(manager.hasSession(created.terminalId)).toBe(false);
	});
});
