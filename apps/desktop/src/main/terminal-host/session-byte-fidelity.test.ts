/**
 * Baseline audit tests for v1 terminal byte fidelity (Milestone 0).
 *
 * Purpose: lock down current v1 behavior before migrating to the v2-grade
 * byte-safe backend. These tests document the known mojibake bug and
 * establish the target behavior the fusion must reach.
 *
 * See: plans/20260724-v1-v2-terminal-fusion.md (Milestone 0/2)
 */
import { beforeEach, describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import {
	createFrameHeader,
	PtySubprocessFrameDecoder,
	PtySubprocessIpcType,
} from "./pty-subprocess-ipc";
import "./xterm-env-polyfill";

const { Session } = await import("./session");

class FakeStdout extends EventEmitter {
	pauseCalls = 0;
	resumeCalls = 0;

	pause(): this {
		this.pauseCalls++;
		return this;
	}

	resume(): this {
		this.resumeCalls++;
		return this;
	}
}

class FakeStdin extends EventEmitter {
	readonly writes: Buffer[] = [];

	write(chunk: Buffer | string): boolean {
		this.writes.push(
			Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"),
		);
		return true;
	}
}

class FakeChildProcess extends EventEmitter {
	readonly stdout = new FakeStdout();
	readonly stdin = new FakeStdin();
	pid = 4242;
	kill(): boolean {
		return true;
	}
}

function createSession(shell = "/bin/sh"): {
	session: InstanceType<typeof Session>;
	child: FakeChildProcess;
} {
	const child = new FakeChildProcess();
	const session = new Session({
		sessionId: "session-mojibake-audit",
		workspaceId: "workspace-1",
		paneId: "pane-1",
		tabId: "tab-1",
		cols: 80,
		rows: 24,
		cwd: "/tmp",
		shell,
		spawnProcess: () => child as unknown as ChildProcess,
	});
	session.spawn({ cwd: "/tmp", cols: 80, rows: 24, env: { PATH: "/usr/bin" } });
	child.stdout.emit("data", createFrameHeader(PtySubprocessIpcType.Ready, 0));
	const pidPayload = Buffer.allocUnsafe(4);
	pidPayload.writeUInt32LE(1234, 0);
	const spawnHeader = createFrameHeader(PtySubprocessIpcType.Spawned, 4);
	child.stdout.emit("data", Buffer.concat([spawnHeader, pidPayload]));
	return { session, child };
}

function emitData(child: FakeChildProcess, bytes: Buffer): void {
	const header = createFrameHeader(PtySubprocessIpcType.Data, bytes.length);
	child.stdout.emit("data", Buffer.concat([header, bytes]));
}

function collectDataEvents(session: InstanceType<typeof Session>): string[] {
	const collected: string[] = [];
	(
		session as unknown as {
			broadcastEvent: (
				eventType: string,
				payload: { type: "data"; data: string },
			) => void;
		}
	).broadcastEvent = (eventType, payload) => {
		if (eventType === "data") collected.push(payload.data);
	};
	return collected;
}

beforeEach(() => {
	// Silence console.warn from shell-ready timeout / backlog warnings.
});

describe("v1 terminal byte fidelity baseline (Milestone 0)", () => {
	describe("current behavior — mojibake on split UTF-8 chunks", () => {
		it("corrupts a multibyte character split across two PTY chunks", () => {
			const { session, child } = createSession("/bin/sh");
			const events = collectDataEvents(session);

			// "中" is U+4E2D → UTF-8 bytes E4 B8 AD (3 bytes).
			// Split it across two chunks: [E4 B8] and [AD].
			const char = "中";
			const utf8 = Buffer.from(char, "utf8");
			expect(utf8.length).toBe(3);
			emitData(child, utf8.subarray(0, 2));
			emitData(child, utf8.subarray(2));

			const received = events.join("");
			// KNOWN BUG: v1 decodes each chunk independently with toString("utf8"),
			// so the split surrogate produces a replacement char + lone trailing
			// byte instead of "中". This test locks the current (broken) baseline.
			// When Milestone 2 routes output through the byte-safe pipeline, this
			// assertion must flip to `toBe(char)`.
			expect(received).not.toBe(char);
		});

		it("corrupts a 4-byte emoji split across chunks", () => {
			const { session, child } = createSession("/bin/sh");
			const events = collectDataEvents(session);

			// "🙂" is U+1F642 → 4 UTF-8 bytes F0 9F 99 82.
			const emoji = "🙂";
			const utf8 = Buffer.from(emoji, "utf8");
			expect(utf8.length).toBe(4);
			// Split after the first byte.
			emitData(child, utf8.subarray(0, 1));
			emitData(child, utf8.subarray(1));

			const received = events.join("");
			// Same mojibake class — 4-byte sequence split at byte 1.
			expect(received).not.toBe(emoji);
		});
	});

	describe("target behavior — byte-safe path must preserve bytes", () => {
		it("preserves a complete multibyte string sent in one chunk", () => {
			const { session, child } = createSession("/bin/sh");
			const events = collectDataEvents(session);

			const text = "你好世界";
			emitData(child, Buffer.from(text, "utf8"));

			const received = events.join("");
			// Even v1 should preserve bytes when a chunk contains complete
			// characters (no split). This is the happy path baseline.
			expect(received).toBe(text);
		});

		it("preserves non-UTF-8 bytes without throwing", () => {
			const { session, child } = createSession("/bin/sh");
			const events = collectDataEvents(session);

			// Arbitrary binary bytes that are not valid UTF-8.
			const raw = Buffer.from([0x00, 0xff, 0xc3, 0xa9, 0x80, 0x7f, 0xfe]);
			expect(() => emitData(child, raw)).not.toThrow();

			const received = Buffer.concat(events.map((e) => Buffer.from(e, "utf8")));
			// v1 decodes with toString("utf8"), so invalid sequences become
			// replacement chars and the bytes do not round-trip. This assertion
			// documents the gap; Milestone 2 must make it round-trip exactly.
			expect(received.length).not.toBe(raw.length);
		});
	});

	describe("v1 supported behaviors audit (Milestone 0 task 1)", () => {
		it("creates a session and reaches ready state", async () => {
			const { session } = createSession("/bin/bash");
			await session.waitForReady();
			expect(session.isAlive).toBe(true);
			expect(session.pid).toBe(1234);
			await session.dispose();
		});

		it("accepts a command option at construction (run-with-command path)", () => {
			const child = new FakeChildProcess();
			const session = new Session({
				sessionId: "session-with-command",
				workspaceId: "workspace-1",
				paneId: "pane-1",
				tabId: "tab-1",
				cols: 80,
				rows: 24,
				cwd: "/tmp",
				shell: "/bin/bash",
				command: "echo hello && exit 0",
				spawnProcess: () => child as unknown as ChildProcess,
			});
			session.spawn({
				cwd: "/tmp",
				cols: 80,
				rows: 24,
				env: { PATH: "/usr/bin" },
			});
			child.stdout.emit(
				"data",
				createFrameHeader(PtySubprocessIpcType.Ready, 0),
			);
			const decoder = new PtySubprocessFrameDecoder();
			const frames = child.stdin.writes.flatMap((c) => decoder.push(c));
			const spawn = frames.find((f) => f.type === PtySubprocessIpcType.Spawn);
			expect(spawn).toBeDefined();
			const payload = JSON.parse(spawn?.payload.toString("utf8") ?? "{}") as {
				args?: string[];
			};
			expect(payload.args?.join(" ")).toContain("echo hello && exit 0");
		});

		it("broadcasts exit events to attached clients", async () => {
			const { session, child } = createSession("/bin/sh");
			await session.waitForReady();

			const socket =
				new EventEmitter() as unknown as import("node:net").Socket & {
					write: (m: string) => boolean;
				};
			const messages: string[] = [];
			socket.write = (m: string) => {
				messages.push(m);
				return true;
			};
			await session.attach(socket);

			const exitPayload = Buffer.allocUnsafe(8);
			exitPayload.writeInt32LE(42, 0);
			exitPayload.writeInt32LE(0, 4);
			const header = createFrameHeader(PtySubprocessIpcType.Exit, 8);
			child.stdout.emit("data", Buffer.concat([header, exitPayload]));

			expect(
				messages.some((m) => m.includes('"exit"') && m.includes("42")),
			).toBe(true);
			session.detach(socket);
			await session.dispose();
		});
	});
});
