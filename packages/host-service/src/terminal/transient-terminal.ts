import { randomBytes, timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import type { NodeWebSocket } from "@hono/node-ws";
import {
	TERMINAL_TERM_PROGRAM,
	TERMINAL_TERM_PROGRAM_VERSION,
} from "@superset/shared/constants";
import type { Hono } from "hono";
import type { DaemonClient } from "./DaemonClient/index.ts";
import { getDaemonClient } from "./daemon-client-singleton.ts";
import {
	getShellBootstrapEnv,
	getTerminalBaseEnv,
	resolveLaunchShell,
	stripTerminalRuntimeEnv,
	waitForTerminalBaseEnv,
} from "./env.ts";

const MAX_BUFFER_BYTES = 64 * 1024;
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;
const MIN_COLS = 20;
const MIN_ROWS = 5;
const MAX_LIFETIME_MS = 30 * 60 * 1000;
const EXIT_RETENTION_MS = 60 * 1000;
const SOCKET_OPEN = 1;

type TransientSocket = {
	readyState: number;
	send(data: string | Uint8Array<ArrayBuffer>): void;
	close(code?: number, reason?: string): void;
};

interface TransientSession {
	id: string;
	token: Buffer;
	daemon: TransientTerminalDaemon;
	unsubscribe: () => void;
	sockets: Set<TransientSocket>;
	buffer: Buffer[];
	bufferBytes: number;
	exit: { exitCode: number; signal: number } | null;
	lifetimeTimer: ReturnType<typeof setTimeout>;
	exitTimer: ReturnType<typeof setTimeout> | null;
}

export interface TransientTerminalDaemon {
	open(
		id: string,
		meta: Parameters<DaemonClient["open"]>[1],
	): ReturnType<DaemonClient["open"]>;
	input(id: string, data: Buffer): void;
	resize(id: string, cols: number, rows: number): void;
	close(id: string, signal?: "SIGHUP"): Promise<void>;
	subscribe(
		id: string,
		opts: { replay: boolean },
		callbacks: {
			onOutput(chunk: Buffer): void;
			onExit(info: { code: number | null; signal: number | null }): void;
		},
	): () => void;
}

export interface CreateTransientTerminalInput {
	command: string;
	cwd?: string;
	cols?: number;
	rows?: number;
}

function dimension(value: number | undefined, min: number, fallback: number) {
	return typeof value === "number" && Number.isFinite(value)
		? Math.max(min, Math.floor(value))
		: fallback;
}

function safeTokenEquals(expected: Buffer, actual: string): boolean {
	let decoded: Buffer;
	try {
		decoded = Buffer.from(actual, "base64url");
	} catch {
		return false;
	}
	return (
		decoded.length === expected.length && timingSafeEqual(decoded, expected)
	);
}

function asArrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
	return bytes as Uint8Array<ArrayBuffer>;
}

export class TransientTerminalManager {
	private readonly sessions = new Map<string, TransientSession>();

	constructor(
		private readonly getDaemon: () => Promise<TransientTerminalDaemon> = getDaemonClient,
	) {}

	async create(input: CreateTransientTerminalInput): Promise<{
		terminalId: string;
		attachmentToken: string;
	}> {
		await waitForTerminalBaseEnv();
		const baseEnv = getTerminalBaseEnv();
		const shell = resolveLaunchShell(baseEnv);
		const terminalId = `transient-${crypto.randomUUID()}`;
		const token = randomBytes(32);
		const cwd = input.cwd || baseEnv.HOME || homedir();
		const env = stripTerminalRuntimeEnv(baseEnv);
		Object.assign(
			env,
			getShellBootstrapEnv({
				shell,
				baseEnv,
				supersetHomeDir: process.env.SUPERSET_HOME_DIR || "",
			}),
			{
				TERM: "xterm-256color",
				TERM_PROGRAM: TERMINAL_TERM_PROGRAM,
				TERM_PROGRAM_VERSION: TERMINAL_TERM_PROGRAM_VERSION,
				SHELL: shell,
			},
		);

		const daemon = await this.getDaemon();
		await daemon.open(terminalId, {
			shell,
			argv: ["-lc", input.command],
			cwd,
			cols: dimension(input.cols, MIN_COLS, DEFAULT_COLS),
			rows: dimension(input.rows, MIN_ROWS, DEFAULT_ROWS),
			env,
		});

		const session: TransientSession = {
			id: terminalId,
			token,
			daemon,
			unsubscribe: () => {},
			sockets: new Set(),
			buffer: [],
			bufferBytes: 0,
			exit: null,
			lifetimeTimer: setTimeout(() => {
				void this.killInternal(terminalId);
			}, MAX_LIFETIME_MS),
			exitTimer: null,
		};
		session.lifetimeTimer.unref?.();
		this.sessions.set(terminalId, session);

		try {
			session.unsubscribe = daemon.subscribe(
				terminalId,
				{ replay: true },
				{
					onOutput: (chunk) => this.handleOutput(session, chunk),
					onExit: ({ code, signal }) =>
						this.handleExit(session, {
							exitCode: code ?? 0,
							signal: signal ?? 0,
						}),
				},
			);
		} catch (error) {
			this.sessions.delete(terminalId);
			clearTimeout(session.lifetimeTimer);
			await daemon.close(terminalId, "SIGHUP").catch(() => {});
			throw error;
		}

		return { terminalId, attachmentToken: token.toString("base64url") };
	}

	write(terminalId: string, attachmentToken: string, data: string): void {
		const session = this.authorize(terminalId, attachmentToken);
		if (session.exit) throw new Error("Transient terminal has exited");
		session.daemon.input(terminalId, Buffer.from(data, "utf8"));
	}

	resize(
		terminalId: string,
		attachmentToken: string,
		cols: number,
		rows: number,
	): void {
		const session = this.authorize(terminalId, attachmentToken);
		if (session.exit) return;
		session.daemon.resize(
			terminalId,
			dimension(cols, MIN_COLS, DEFAULT_COLS),
			dimension(rows, MIN_ROWS, DEFAULT_ROWS),
		);
	}

	async kill(terminalId: string, attachmentToken: string): Promise<void> {
		this.authorize(terminalId, attachmentToken);
		await this.killInternal(terminalId);
	}

	attach(
		terminalId: string,
		attachmentToken: string,
		socket: TransientSocket,
	): () => void {
		const session = this.authorize(terminalId, attachmentToken);
		session.sockets.add(socket);
		socket.send(JSON.stringify({ type: "attached", terminalId }));
		if (session.bufferBytes > 0) {
			const replay = Buffer.concat(session.buffer, session.bufferBytes);
			socket.send(asArrayBufferBytes(replay));
			session.buffer = [];
			session.bufferBytes = 0;
		}
		if (session.exit) {
			socket.send(JSON.stringify({ type: "exit", ...session.exit }));
		}
		return () => session.sockets.delete(socket);
	}

	hasSession(terminalId: string): boolean {
		return this.sessions.has(terminalId);
	}

	private authorize(
		terminalId: string,
		attachmentToken: string,
	): TransientSession {
		const session = this.sessions.get(terminalId);
		if (!session || !safeTokenEquals(session.token, attachmentToken)) {
			throw new Error("Transient terminal not found or token is invalid");
		}
		return session;
	}

	private handleOutput(session: TransientSession, chunk: Buffer): void {
		let sent = false;
		for (const socket of session.sockets) {
			if (socket.readyState !== SOCKET_OPEN) {
				session.sockets.delete(socket);
				continue;
			}
			socket.send(asArrayBufferBytes(chunk));
			sent = true;
		}
		if (sent) return;
		session.buffer.push(Buffer.from(chunk));
		session.bufferBytes += chunk.byteLength;
		while (
			session.bufferBytes > MAX_BUFFER_BYTES &&
			session.buffer.length > 1
		) {
			const removed = session.buffer.shift();
			if (removed) session.bufferBytes -= removed.byteLength;
		}
	}

	private handleExit(
		session: TransientSession,
		exit: { exitCode: number; signal: number },
	): void {
		if (session.exit) return;
		session.exit = exit;
		for (const socket of session.sockets) {
			if (socket.readyState === SOCKET_OPEN) {
				socket.send(JSON.stringify({ type: "exit", ...exit }));
			}
		}
		session.exitTimer = setTimeout(
			() => this.forget(session.id),
			EXIT_RETENTION_MS,
		);
		session.exitTimer.unref?.();
	}

	private async killInternal(terminalId: string): Promise<void> {
		const session = this.sessions.get(terminalId);
		if (!session) return;
		try {
			if (!session.exit) await session.daemon.close(terminalId, "SIGHUP");
		} finally {
			this.forget(terminalId);
		}
	}

	private forget(terminalId: string): void {
		const session = this.sessions.get(terminalId);
		if (!session) return;
		this.sessions.delete(terminalId);
		clearTimeout(session.lifetimeTimer);
		if (session.exitTimer) clearTimeout(session.exitTimer);
		session.unsubscribe();
		for (const socket of session.sockets) {
			try {
				socket.close(1000, "Transient terminal ended");
			} catch {
				// best effort
			}
		}
		session.sockets.clear();
	}
}

export const transientTerminalManager = new TransientTerminalManager();

export function registerTransientTerminalRoute({
	app,
	upgradeWebSocket,
	manager = transientTerminalManager,
}: {
	app: Hono;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
	manager?: TransientTerminalManager;
}) {
	app.get(
		"/terminal/transient/:terminalId",
		upgradeWebSocket((c) => {
			const terminalId = c.req.param("terminalId") ?? "";
			const attachmentToken = c.req.query("attachmentToken") ?? "";
			let detach: (() => void) | null = null;
			return {
				onOpen: (_event, ws) => {
					try {
						detach = manager.attach(terminalId, attachmentToken, ws);
					} catch {
						ws.close(1008, "Invalid transient terminal capability");
					}
				},
				onClose: () => detach?.(),
				onError: () => detach?.(),
			};
		}),
	);
}
